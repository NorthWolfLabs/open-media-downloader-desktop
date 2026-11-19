//! Native mouse-down handling for the empty macOS traffic-light/sidebar area.
//! The native buttons stay above these transparent views; the web toggle is excluded.
#[tauri::command]
pub fn v2_set_titlebar_drag_regions(
    window: tauri::WebviewWindow,
    enabled: bool,
    expanded: bool,
    center_y: f64,
    toggle_start: f64,
    toggle_end: f64,
) -> Result<(), String> {
    if !center_y.is_finite() || !(16.0..=160.0).contains(&center_y) { return Err("Invalid header geometry".into()); }
    if !toggle_start.is_finite() || !toggle_end.is_finite() || toggle_start < 0.0 || toggle_end < toggle_start || toggle_end > 512.0 { return Err("Invalid toggle geometry".into()); }
    #[cfg(target_os = "macos")]
    {
        let target = window.clone();
        window.run_on_main_thread(move || native::update(&target, enabled, expanded, center_y, toggle_start, toggle_end))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (window, enabled, expanded, center_y, toggle_start, toggle_end);
    Ok(())
}

#[cfg(target_os = "macos")]
mod native {
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadOnly};
    use objc2_app_kit::{NSAutoresizingMaskOptions, NSEvent, NSView, NSWindow, NSWindowButton, NSWindowStyleMask, NSWindowDidUpdateNotification};
    use objc2_foundation::{MainThreadMarker, NSNotification, NSNotificationCenter, NSPoint, NSRect, NSSize};

    define_class!(
        #[unsafe(super(NSView))]
        #[thread_kind = MainThreadOnly]
        #[ivars = isize]
        struct OMDTitlebarDragView;
        impl OMDTitlebarDragView {
            #[unsafe(method(tag))]
            fn region_tag(&self) -> isize { *self.ivars() }
            #[unsafe(method(windowDidUpdate:))]
            fn window_did_update(&self, _notification: &NSNotification) {
                // AppKit can relayout standard controls during a redraw without
                // resizing the web content. Reconcile after that native layout.
                if !self.isHidden() {
                    if let Some(window) = self.window() { align_buttons(&window, self.frame().size.height / 2.0); }
                }
            }
            #[unsafe(method(mouseDown:))]
            fn mouse_down(&self, event: &NSEvent) {
                if self.window().is_some() {
                    if cfg!(debug_assertions) && std::env::var_os("OMD_TRACE_WINDOW_GEOMETRY").is_some() {
                        eprintln!("OMD_NATIVE_DRAG tag={} point={:?} type={:?}", self.ivars(), event.locationInWindow(), event.r#type());
                    }
                    let _: () = unsafe { msg_send![super(self), mouseDown: event] };
                }
            }
            #[unsafe(method(mouseDownCanMoveWindow))]
            fn mouse_down_can_move_window(&self) -> bool { true }
            #[unsafe(method(acceptsFirstMouse:))]
            fn accepts_first_mouse(&self, _event: Option<&NSEvent>) -> bool { true }
        }
    );

    fn align_buttons(native: &NSWindow, center_y: f64) {
        let Some(content) = native.contentView() else { return };
        let bounds = content.bounds();
        if !native.styleMask().contains(NSWindowStyleMask::FullScreen) {
            let kinds = [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton];
            if let Some(close) = native.standardWindowButton(kinds[0]) {
                // AppKit clips the button group to its enclosing titlebar. Resize
                // that container, not the button group. Tauri's fixed inset must
                // be absent: Tao reapplies it on every draw and would undo this.
                if let Some(group) = unsafe { close.superview() } {
                    if let Some(container) = unsafe { group.superview() } {
                        let mut frame = container.frame();
                        let height = center_y * 2.0;
                        frame.origin.y += frame.size.height - height;
                        frame.size.height = height;
                        if (container.frame().size.height - height).abs() > 0.01 { container.setFrame(frame); }
                    }
                }
                let spacing = native.standardWindowButton(kinds[1]).map(|b| b.frame().origin.x-close.frame().origin.x).unwrap_or(20.0);
                for (index, kind) in kinds.into_iter().enumerate() {
                    if let Some(button) = native.standardWindowButton(kind) {
                        if let Some(parent) = unsafe { button.superview() } {
                            let point=NSPoint::new(0.0,if content.isFlipped(){center_y}else{bounds.size.height-center_y});
                            let local=parent.convertPoint_fromView(point,Some(&content));
                            let frame=button.frame();
                            let origin=NSPoint::new(20.0 + index as f64 * spacing,local.y-frame.size.height/2.0);
                            if (frame.origin.x-origin.x).abs()>0.01 || (frame.origin.y-origin.y).abs()>0.01 { button.setFrameOrigin(origin); }
                        }
                    }
                }
            }
        }
    }

    pub fn update(window: &tauri::WebviewWindow, enabled: bool, expanded: bool, center_y: f64, toggle_start: f64, toggle_end: f64) {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let Ok(ptr) = window.ns_window() else { return };
        // Tauri owns the NSWindow. This runs on its main thread and retains no raw pointer.
        let native = unsafe { &*ptr.cast::<NSWindow>() };
        let Some(content) = native.contentView() else { return };
        let bounds = content.bounds();
        // Map the measured web heading center into the actual native button
        // container. Never assume its coordinate origin or a fixed button height.
        let enabled = enabled && !native.styleMask().contains(NSWindowStyleMask::FullScreen);
        if enabled { align_buttons(native, center_y); }

        if cfg!(debug_assertions) && std::env::var_os("OMD_TRACE_WINDOW_GEOMETRY").is_some() {
            eprintln!("OMD_NATIVE_REGIONS bounds={:?} flipped={} enabled={} expanded={}", bounds, content.isFlipped(), enabled, expanded);
        }
        let right = if expanded {
            if bounds.size.width <= 1000.0 { 180.0 } else { 210.0 }
        } else { 144.0 };
        for (tag, x, width) in [(0x4f4d4401, 0.0, toggle_start), (0x4f4d4402, toggle_end, (right - toggle_end).max(0.0))] {
            let frame = NSRect::new(NSPoint::new(x, bounds.size.height - center_y*2.0), NSSize::new(width, center_y*2.0));
            let view = if let Some(view) = content.viewWithTag(tag) {
                view
            } else {
                let allocated = OMDTitlebarDragView::alloc(mtm).set_ivars(tag);
                let view: objc2::rc::Retained<OMDTitlebarDragView> = unsafe {
                    msg_send![super(allocated), initWithFrame: frame]
                };
                content.addSubview(&view);
                if tag == 0x4f4d4401 {
                    // Selector observers are weak on supported macOS versions;
                    // the window owns this view for the lifetime of registration.
                    unsafe { NSNotificationCenter::defaultCenter().addObserver_selector_name_object(
                        &view, sel!(windowDidUpdate:), Some(NSWindowDidUpdateNotification), Some(native)); }
                }
                objc2::rc::Retained::into_super(view)
            };
            view.setFrame(frame);
            view.setAutoresizingMask(NSAutoresizingMaskOptions::ViewMinYMargin);
            view.setHidden(!enabled);
        }
    }
}

/// `update` receives Tauri's autoreleased NSWindow and immediately asks it for
/// its content view. objc2 0.6.4 could tail-call the retain of that result, so
/// macOS 13+ handed over the autoreleased window instead and the content view
/// lost one retain per call (objc2 #861). Only optimized builds emit that tail
/// call; run `cargo test --release` to exercise the original failure.
#[cfg(all(test, target_os = "macos"))]
mod autoreleased_return_tests {
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::NSObject;

    fn retain_count(object: &NSObject) -> usize { unsafe { objc2::msg_send![object, retainCount] } }

    #[inline(never)]
    fn retain_returned(object: &NSObject) -> Retained<NSObject> {
        let object = unsafe { Retained::retain_autoreleased((object as *const NSObject).cast_mut()) };
        // SAFETY: retaining a pointer from a reference never yields null. A
        // checked unwrap would add a branch and hide the tail call under test.
        unsafe { object.unwrap_unchecked() }
    }

    #[inline(never)]
    fn autorelease_then_retain_other(autoreleased: Retained<NSObject>, other: &NSObject) {
        let _ = Retained::autorelease_ptr(autoreleased);
        drop(retain_returned(other));
    }

    #[test]
    fn retaining_a_returned_object_never_claims_an_unrelated_autorelease() {
        let window = NSObject::new();
        let content = NSObject::new();
        // A spare retain keeps a failing run from freeing `content` mid-test.
        std::mem::forget(content.clone());
        let before = retain_count(&content);
        autoreleasepool(|_| autorelease_then_retain_other(window.clone(), &content));
        assert_eq!(retain_count(&content), before, "the content view lost a retain");
        assert_eq!(retain_count(&window), 1, "the window's autorelease was claimed");
    }
}
