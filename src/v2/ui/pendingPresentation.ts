/** Avoid unreadable flashes without delaying the operation or disabling controls longer. */
export class PendingPresentation {
  private delay?: ReturnType<typeof setTimeout>;
  private hide?: ReturnType<typeof setTimeout>;
  private shownAt = 0;
  private visible = false;
  private label = "";
  private presented = "";
  constructor(private publish: (label: string) => void) {}
  update(label: string) {
    this.label = label;
    clearTimeout(this.delay);
    clearTimeout(this.hide);
    if (label) {
      if (!this.visible)
        this.delay = setTimeout(() => {
          this.visible = true;
          this.shownAt = Date.now();
          this.presented = this.label;
          this.publish(this.label);
        }, 300);
      else if (label !== this.presented)
        this.delay = setTimeout(
          () => {
            this.shownAt = Date.now();
            this.presented = this.label;
            this.publish(this.label);
          },
          Math.max(0, 700 - (Date.now() - this.shownAt)),
        );
      // Change wording only after the preceding message has been readable.
    } else if (this.visible) {
      this.hide = setTimeout(
        () => {
          this.visible = false;
          this.publish("");
        },
        Math.max(0, 700 - (Date.now() - this.shownAt)),
      );
    }
  }
  dispose() {
    clearTimeout(this.delay);
    clearTimeout(this.hide);
  }
}
