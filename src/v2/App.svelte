<script lang="ts">
  import { appLocale } from "./locale";
  import {
    releaseStatuses,
    activeReleaseKeys,
    matchesBulkSelection,
    type AcquisitionStatus,
    type BulkSelection,
  } from "./releaseSelection";
  import { releaseVisible, usableLocalFiles } from "./releaseVisibility";
  import EmptyState from "./ui/EmptyState.svelte";
  import PluginPrerequisite from "./PluginPrerequisite.svelte";
  import ProjectLink from "./ui/ProjectLink.svelte";
  import { projectLinks, openProjectLink } from "./links";
  import { plural } from "./plural";
  import { formatDate, formatTime } from "./dates";
  import { STARTUP_SETTLED, startupFailure, startWhileEngineStops, type StartupFailure } from "./startup";
  import { pluginReview, hostLabel, signInAuthority } from "./pluginReview";
  import StatCard from "./ui/StatCard.svelte";
  import { subscriptionActions, fileStatusLabels } from "./copy";
  import { removalLabels } from "./history";
  import BackButton from "./ui/BackButton.svelte";
  import Toast from "./ui/Toast.svelte";
  import { configureDisplaySources, configureDisplayAccounts, resetDisplayMemory } from "./displayCache";
  import CacheSettings from "./CacheSettings.svelte";
  import { clearItemCache } from "./itemCache";
  import { sectionPage, clearSectionCache } from "./sectionCache";
  import { mainItem, cachedItemMetadata } from "./itemCache";
  let openingDetails = $state(false);
  import ActionMenu from "./ui/ActionMenu.svelte";
  import PageHeading from "./ui/PageHeading.svelte";
  import SourcesPage from "./SourcesPage.svelte";
  import ProfileSubscriptionDialog from "./ProfileSubscriptionDialog.svelte";
  import SearchSubscriptionDialog from "./SearchSubscriptionDialog.svelte";
  import { sameSearch } from "./savedSearch";
  import PendingStatus from "./ui/PendingStatus.svelte";
  import SubscriptionsPage from "./SubscriptionsPage.svelte";
  import { ExternalLink } from "lucide-svelte";
  import History from "./History.svelte";
  import RemovalDialog from "./RemovalDialog.svelte";
  import type { RemovalMode } from "./history";
  let historyTitle = $state<string | null>(null);
  let historyBack = $state<() => void>(() => {});
  let removal = $state<{ jobs: Job[]; mode: RemovalMode } | null>(null);
  import DownloadList from "./DownloadList.svelte";
  import { truncatedTitle } from "./truncatedTitle";
  import SavedFiles from "./SavedFiles.svelte";
  import Field from "./ui/Field.svelte";
  import DownloadReview from "./DownloadReview.svelte";
  import DownloadCheck from "./DownloadCheck.svelte";
  import DownloadChecks from "./DownloadChecks.svelte";
  import ImageDownloadDialog from './ImageDownloadDialog.svelte';
  import { imageGroups, imageRelease } from './imageSelection';
  import DownloadOptionsDialog from "./DownloadOptionsDialog.svelte";
  import AnotherFormatDialog from "./AnotherFormatDialog.svelte";
  import {
    formatChoice,
    formatPreparation,
    needsAnotherFormat,
    type FormatChoice,
  } from "./jobIssue";
  import {
    checkIssue,
    contextsFromStorage,
    finishedWithoutDownloads,
    reconcileNotice,
    reconcileSelection,
    reusableCheck,
    dismissedFromStorage,
    type DownloadContext,
    type SelectionTask,
    type Preparation,
  } from "./downloadReview";
  import Button from "./ui/Button.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import InfiniteMore from "./InfiniteMore.svelte";
  import Discovery from "./Discovery.svelte";
  import { submissionCounts, type Submission } from "./submissionCounts";
  import LayoutPicker, {type ResultLayout} from "./LayoutPicker.svelte";
  import ResultBrowser from "./ResultBrowser.svelte";
  import {durationLabel,subscriptionTarget,publishedAge} from "./mediaPresentation";
  import {Table2} from "lucide-svelte";
  import CollectionInfo, {
    type CollectionInfoSnapshot,
  } from "./CollectionInfo.svelte";
  import LanguagePicker from "./LanguagePicker.svelte";
  import {
    languageName,
    preferredSystemLanguage,
    availableLanguageOptions,
  } from "./languages";
  import { discoveryState } from "./discoveryState";
  import { ResourceInvalidation } from "./resourceInvalidation";
  import { pageWindow } from "./pageWindow";
  import AccountPicker from "./AccountPicker.svelte";
  import SourceAccounts from "./SourceAccounts.svelte";
  import SourceRemovals from "./SourceRemovals.svelte";
  import Notifications from "./Notifications.svelte";
  import { titlebarGeometry } from "./titlebarGeometry";
  import { appIcon } from "./appIcon";
  import AppearanceSettings from "./AppearanceSettings.svelte";
  import { restoreCustomTheme } from "./theme";
  import { languageList, reconcilePreferences, preferenceKey } from "./preferences";
  import PresentationSettings from "./PresentationSettings.svelte";
  import FileOperations from "./FileOperations.svelte";
  import { actionFocus } from "./actionFocus";
  import { onMount, untrack, tick } from "svelte";
  import {
    EngineClient,
    EngineError,
    type Connection,
    type Collection,
    type CollectionDetails,
    type Release,
    type Job,
    type Destination,
    type Subscription,
    type SubscribeRequest,
    type ProviderManifest,
    type Recipe,
    type Problem,
    type Page,
    type Artifact,
    type SourceRef,
    type IdentifiedSource,
  } from "./client";
  import Dialog from "./Dialog.svelte";
  import { trackDialogTriggers } from "./dialogFocus";
  import { isAudioCollection, canSubscribe, subscriptionLabel } from "./mediaPresentation";
  import OutputOptions from "./OutputOptions.svelte";
  import {
    loadOutputPreferences,
    outputKind,
    saveOutputPreferences,
  } from "./outputPreferences";
  import Artwork from "./Artwork.svelte";
  import StoragePanel from "./StoragePanel.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { trackWindowActivity } from "./windowActivity";
  import {
    LayoutDashboard,
    Search, Compass,
    Download,
    Rss,
    Blocks,
    Settings,
    Plus,
    Folder,
    AlertCircle,
    Pencil,
    PanelLeft,
    ShieldAlert,
    LoaderCircle,
    X,
  } from "lucide-svelte";
  type Source = { manifest: ProviderManifest; digest: string };
  let client: EngineClient | null = $state(null);
  // Native startup errors use their first line for people; any further lines are
  // diagnostics shown only under Technical details (startup.ts).
  let connectionFailure = $state<StartupFailure | null>(null);
  let detailsNotice = $state("");
  async function copyStartupDetails() {
    if (!connectionFailure) return;
    try {
      await navigator.clipboard.writeText(
        [connectionFailure.summary, connectionFailure.detail].filter(Boolean).join("\n"),
      );
      detailsNotice = "Details copied.";
    } catch {
      detailsNotice = "Couldn’t copy the details.";
    }
  }
  async function revealStartupLog() {
    try {
      await invoke("v2_reveal_engine_log");
      detailsNotice = "";
    } catch (e) {
      detailsNotice = text(e);
    }
  }
  let appVersion = $state<string | null>(null);
  let starting = $state(false);
  let endpoint = $state("http://127.0.0.1:9000");
  let token = $state("");
  let view = $state("Overview");
  let galleryControls = $state<import("svelte").Snippet>();
  let searchState = $state(discoveryState());
  let sidebarCollapsed = $state(
    localStorage.getItem("omd.sidebar-collapsed") === "true",
  );
  let recovering = $state(false);
  // Arriving from "Review downloads" shows only the downloads that need attention.
  let downloadAttention = $state(false);
  let recoveryAttempt = 0;
  let disposed = false;
  const views = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Search", icon: Compass },
    { name: "Downloads", icon: Download },

    { name: "Subscriptions", icon: Rss },
    { name: "Sources", icon: Blocks },
    { name: "Settings", icon: Settings },
  ];
  let sources: Source[] = $state([]);
  let destinations: Destination[] = $state([]);
  let storageRevision = $state(0);
  let removalRevision = $state(0);
  let notificationRevision = $state(0);
  let referencePackages: {
    id: string;
    name: string;
    description?: string;
    version: string;
    path: string;
  }[] = $state([]);
  const availablePackages = $derived(
    referencePackages.filter(
      (p) => !sources.some((s) => s.manifest.id === p.id),
    ),
  );
  const sourceUpdates = $derived(
    referencePackages.filter((p) =>
      sources.some(
        (s) =>
          s.manifest.id === p.id && newerVersion(p.version, s.manifest.version),
      ),
    ),
  );
  // OMD ships without sources; every empty surface states the same prerequisite.
  const sourcePrerequisite = $derived(
    availablePackages.length
      ? "OMD works with source plugins you choose. This copy includes some you can review and install."
      : "OMD works with source plugins you choose. Add one to start browsing.",
  );
  const firstImportLabel = $derived(
    availablePackages.length ? "Review included plugins" : "Add a plugin file…",
  );
  function importFirstSource() {
    if (availablePackages.length) void navigate("Sources");
    else void pickPackage();
  }
  function newerVersion(candidate: string, installed: string) {
    const a = candidate.split(".").map(Number),
      b = installed.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }
  let sourceRemovals:
    | { inspect: (provider: string) => Promise<void> }
    | undefined = $state();
  let fileRevision = $state(0);
  let acquisitionRevision = $state(0);
  let acquired: Record<string, AcquisitionStatus> = $state({});
  let downloadNotice = $state<{
    group: JobGroup;
    created: number;
    existing: number;
  } | null>(null);
  let acquiredLoading = $state(false),
    acquiredError = $state("");
  let acquiredRequest = 0;
  const sourceKey = (reference: import("./client").SourceRef) =>
    JSON.stringify([reference.provider, reference.id]);
  $effect(() => {
    void acquisitionRevision;
    void fileRevision;
    untrack(() => {
      if (client && details && releases.length)
        void loadAcquired(
          client,
          releases.map((release) => release.reference),
        );
    });
  });
  async function loadAcquired(
    active: EngineClient,
    refs: import("./client").SourceRef[],
  ) {
    const request = ++acquiredRequest;
    acquiredLoading = true;
    acquiredError = "";
    const values: Record<string, AcquisitionStatus> = {};
    try {
      const [statuses, activeJobs] = await Promise.all([
        releaseStatuses(active, refs),
        activeReleaseKeys(active),
      ]);
      Object.assign(values, statuses);
      if (request === acquiredRequest) activeReleases = activeJobs;
      // Merge: the request covers only the current screen's releases. Replacing the
      // map dropped statuses of a parent list's rows (an item's page refreshes only
      // its own release), so their "Downloaded" markers vanished on return.
      if (request === acquiredRequest) acquired = { ...acquired, ...values };
    } catch (e) {
      if (request === acquiredRequest) acquiredError = text(e);
    } finally {
      if (request === acquiredRequest) acquiredLoading = false;
    }
  }
  let presentation:
    | {
        edit: (
          kind: "collection" | "release",
          reference: import("./client").SourceRef,
          source: import("./client").MetadataOverride,
        ) => Promise<void>;
      }
    | undefined = $state();
  let fileOperations:
    | {
        create: (
          job: string,
          mode:
            | "reconcile"
            | "remove_files"
            | "forget_history"
            | "remove_files_and_history",
        ) => Promise<void>;
      }
    | undefined = $state();
  async function manageFiles(
    mode:
      | "reconcile"
      | "remove_files"
      | "forget_history"
      | "remove_files_and_history",
  ) {
    if (!filesOpen || !fileOperations) return;
    const job = filesOpen.id;
    filesOpen = null;
    await fileOperations.create(job, mode);
  }
  type JobGroup = {
    id: string;
    title: string;
    created_at: string;
    total: number;
    completed: number;
    active: number;
    paused: number;
    failed: number;
    canceled: number;
  };
  let jobGroups: JobGroup[] = $state([]);
  let groupsCursor: string | null = $state(null);
  let activeGroup: JobGroup | null = $state(null);
  let grouped = $state(true);
  let jobs: Job[] = $state([]);
  let summary = $state({
    active_jobs: 0,
    acquired: 0,
    following: 0,
    attention: 0,
  });
  let subscriptions: Subscription[] = $state([]);
  let inbox: any[] = $state([]);
  let inboxCursor: string | null = $state(null);

  let jobCursor: string | null = $state(null);
  let subscriptionCursor: string | null = $state(null);
  let busy = $state("");
  let error = $state("");
  let notice = $state("");
  let noMissingNotice = $state("");
  $effect(() => {
    const message = notice;
    if (!message) return;
    const timer = setTimeout(() => {
      if (notice === message) notice = "";
    }, 8000);
    return () => clearTimeout(timer);
  });
  let sourceId = $state("");
  function savedAccounts(): Record<string, string | null> {
    try {
      const value = JSON.parse(
        localStorage.getItem("omd.source-accounts") ?? "{}",
      );
      if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
      return Object.fromEntries(
        Object.entries(value).filter(
          ([, v]) => v === null || typeof v === "string",
        ),
      ) as Record<string, string | null>;
    } catch {
      return {};
    }
  }
  let accountProfiles: Record<string, string | null> = $state(savedAccounts());
  $effect(() => {
    localStorage.setItem(
      "omd.source-accounts",
      JSON.stringify(accountProfiles),
    );
  });
  let accountsSource: ProviderManifest | null = $state(null);
  let accountRevision = $state(0);
  $effect(()=>{const values=JSON.stringify(accountProfiles);if(client)configureDisplayAccounts(client,JSON.parse(values));});
  const accountFor = (provider: string) => accountProfiles[provider] ?? null;
  const hasAccounts = (provider: string) =>
    sources.some(
      (source) =>
        source.manifest.id === provider &&
        source.manifest.grants.some((grant) => grant.credential),
    );
  let url = $state("");
  let details: Collection | null = $state(null);
  let releaseLayout=$state<ResultLayout>("grid");
  let releaseTable=$state(false);
  let releaseActive=$state(0);
  function releaseCollection(release:Release):Collection {
    return release.preview ?? {reference:release.reference,kind:"item",title:release.title,canonical_url:release.canonical_url,artwork_url:null,description:null};
  }
  let releases: Release[] = $state([]);
  let releaseCursor: string | null = $state(null);
  let showUnavailable = $state(
    localStorage.getItem("omd.show-unavailable") === "true",
  );
  $effect(() => {
    localStorage.setItem("omd.show-unavailable", String(showUnavailable));
  });
  let selected: Set<string> = $state(new Set());
  let selectionCatalog: Release[] = $state([]);
  let activeReleases: Set<string> = $state(new Set());
  let selecting = $state(false);
  let queueingSelection = $state(false);
  let selectionProgress = $state("");
  let selectionError = $state("");
  let bulkGeneration = 0;
  const selectionScope = () =>
    JSON.stringify([
      details?.reference,
      language,
      group,
      releaseOrder,
      details && accountFor(details.reference.provider),
    ]);
  function clearSelection() {
    bulkGeneration++;
    selecting = false;
    selected = new Set();
    selectionCatalog = [];
    selectionError = "";
    selectionProgress = "";
  }
  async function selectBulk(mode: BulkSelection) {
    if (!client || !details || selecting) return;
    const active = client,
      collection = details,
      scope = selectionScope();
    const generation = ++bulkGeneration;
    const current = () =>
      generation === bulkGeneration &&
      active === client &&
      details?.reference.id === collection.reference.id &&
      scope === selectionScope();
    const chosenLanguage = language,
      chosenGroup = group,
      media = mediaSource;
    const input = {
      operation: "releases" as const,
      reference: collection.reference,
      credential_profile: accountFor(collection.reference.provider),
      release_order: media && !audioSource ? null : (releaseOrder as "asc" | "desc"),
      page_size: 100,
      policy: policy(),
    };
    selecting = true;
    selectionError = "";
    selectionProgress = "Finding matching releases…";
    try {
      let catalog = [...releases],
        cursor = releaseCursor;
      const cursors = new Set<string>();
      while (cursor) {
        if (cursors.has(cursor))
          throw new Error("The source repeated a page. Try selecting again.");
        cursors.add(cursor);
        const page = await sectionPage<Release>(
          active,
          collection.reference.provider,
          { ...input, cursor },
          sources.find((s) => s.manifest.id === collection.reference.provider)
            ?.manifest.version,
        );
        if (!current()) return;
        catalog.push(...page.items);
        selectionProgress = `${catalog.length} releases found…`;
        cursor = page.next_cursor;
      }
      catalog = [
        ...new Map(catalog.map((r) => [sourceKey(r.reference), r])).values(),
      ].filter(
        (r) =>
          (media || !chosenLanguage || r.language === chosenLanguage) &&
          (media || !chosenGroup || r.group === chosenGroup),
      );
      selectionProgress = `Checking download status for ${catalog.length} releases…`;
      const [statuses, activeJobs] = await Promise.all([
        releaseStatuses(
          active,
          catalog.map((r) => r.reference),
        ),
        activeReleaseKeys(active),
      ]);
      if (!current()) return;
      acquired = { ...acquired, ...statuses };
      activeReleases = activeJobs;
      selectionCatalog = catalog;
      selected = new Set(
        catalog
          .filter((r) => matchesBulkSelection(r, mode, statuses, activeJobs))
          .map((r) => r.reference.id),
      );
      if (!selected.size)
        selectionProgress = "No releases match this selection.";
    } catch (e) {
      if (current()) selectionError = text(e);
    } finally {
      if (generation === bulkGeneration) selecting = false;
    }
  }
  let language = $state(preferredSystemLanguage());
  let collectionLanguages: string[] = $state([]);
  let languagesLoaded = $state(false);
  let preserveReleaseLanguage = false;
  const releaseLanguages = $derived(
    availableLanguageOptions(collectionLanguages),
  );
  function receivedLanguages(values: string[]) {
    collectionLanguages = values;
    languagesLoaded = true;
    if (!preserveReleaseLanguage && language && !values.includes(language)) {
      language = "";
      selected = new Set();
      if (!openingDetails) void loadReleases(false);
    }
  }
  let group = $state("");
  let jobQuery = $state("");
  let appliedJobQuery = $state("");
  const listTargets = new Map<string, number>();
  const refreshVersions: Record<string, number> = {};
  let rootJobQuery = "";
  let rootJobs: Page<Job> = { items: [], next_cursor: null };
  const jobsKey = () => `${activeGroup?.id ?? ""}:${appliedJobQuery}`;
  function appendUnique<T extends { id: string }>(previous: T[], items: T[]) {
    const found = new Set(previous.map((item) => item.id));
    return [...previous, ...items.filter((item) => !found.has(item.id))];
  }
  async function moreJobs() {
    if (!client || !jobCursor) return;
    const active = client,
      key = jobsKey(),
      cursor = jobCursor,
      version = refreshVersions.jobs;
    const page =
      activeGroup && view === "Downloads"
        ? await active.request<Page<Job>>(
            `/v2/groups/${activeGroup.id}/jobs?${new URLSearchParams({ q: appliedJobQuery, limit: "100", cursor })}`,
          )
        : await active.jobs(
            appliedJobQuery,
            cursor,
            view === "History" ? "completed" : "active",
          );
    if (
      client !== active ||
      jobsKey() !== key ||
      version !== refreshVersions.jobs
    )
      return;
    jobs = appendUnique(jobs, page.items);
    jobCursor = page.next_cursor;
    listTargets.set(key, jobs.length);
    if (!activeGroup) rootJobs = { items: jobs, next_cursor: jobCursor };
  }
  async function moreResource(
    resource: "groups" | "inbox" | "subscriptions" | "selections",
  ) {
    if (!client) return;
    const active = client,
      version = refreshVersions[resource],
      query = appliedJobQuery;
    const cursor = {
      groups: groupsCursor,
      inbox: inboxCursor,
      subscriptions: subscriptionCursor,
      selections: selectionsCursor,
    }[resource];
    if (!cursor) return;
    const page = await active.request<Page<any>>(
      `/v2/${resource}?${new URLSearchParams({ limit: "100", cursor, ...(resource === "groups" ? { q: query, state: "active" } : {}) })}`,
    );
    if (resource === "selections")
      page.items = await checkOutcomes(active, page.items);
    if (
      active !== client ||
      version !== refreshVersions[resource] ||
      (resource === "groups" && query !== appliedJobQuery)
    )
      return;
    if (resource === "groups") {
      jobGroups = appendUnique(jobGroups, page.items);
      groupsCursor = page.next_cursor;
      listTargets.set(`groups:${query}`, jobGroups.length);
    }
    if (resource === "inbox") {
      inbox = appendUnique(inbox, page.items);
      inboxCursor = page.next_cursor;
      listTargets.set(resource, inbox.length);
    }
    if (resource === "subscriptions") {
      subscriptions = appendUnique(subscriptions, page.items);
      subscriptionCursor = page.next_cursor;
      listTargets.set(resource, subscriptions.length);
    }
    if (resource === "selections") {
      selectionTasks = appendUnique(selectionTasks, page.items);
      selectionsCursor = page.next_cursor;
      listTargets.set(resource, selectionTasks.length);
    }
  }

  let destinationId = $state(localStorage.getItem("omd.destination") ?? "");
  $effect(() => {
    if (destinationId) localStorage.setItem("omd.destination", destinationId);
  });
  let recipe = $state<Recipe>("cbz");
  let maxHeight = $state(1080);
  let subtitles = $state("");
  let automaticSubtitles = $state(false);
  let startingChecks = $state<string[]>([]);
  let checkStartError = $state("");
  let pendingReferences: SourceRef[] | null = $state(null);
  let editSubtitles = $state("");
  const isMedia = (id: string) =>
    sources.find((source) => source.manifest.id === id)?.manifest.media_tools ??
    false;
  const mediaSource = $derived.by(() =>
    isMedia(details?.reference.provider ?? sourceId),
  );
  const audioSource = $derived(!!details && isAudioCollection(details));
  const detailsSourceName = $derived(
    sources.find((source) => source.manifest.id === details?.reference.provider)
      ?.manifest.name ?? "",
  );
  /** Output choices come from the last download of the same kind (video, audio or images). */
  function configureSource(id: string, audio = false) {
    sourceId = id;
    ({ recipe, maxHeight, subtitles, automaticSubtitles } = loadOutputPreferences(
      outputKind(isMedia(id), audio),
    ));
  }
  let selectionTasks: SelectionTask[] = $state([]);
  let selectionsCursor: string | null = $state(null);
  let selectionTask: SelectionTask | null = $state(null);
  let downloadContexts = $state<Record<string, DownloadContext>>(
    contextsFromStorage(),
  );
  let dismissedChecks = $state<string[]>(dismissedFromStorage());
  let dismissedUndo = $state<{ ids: string[]; title: string } | null>(null);
  type DownloadDraft = {
    context: DownloadContext;
    snapshot?: SelectionTask;
    language: string;
    group: string;
    maxHeight: number;
    subtitles: string;
    automaticSubtitles: boolean;
    languages: string[];
    groups: string[];
  };
  let downloadDraft = $state<DownloadDraft | null>(null);
  const advancingChecks = new Set<string>();
  const openingReviews = new Set<string>();
  const contextLookups = new Set<string>();
  const visibleChecks = $derived(
    selectionTasks.filter(
      (task) =>
        task.state !== "submitted" &&
        task.state !== "canceled" &&
        !dismissedChecks.includes(task.id) &&
        !finishedWithoutDownloads(task, downloadContexts[task.id]) &&
        !selectionTasks.some((child) => child.request.snapshot_id === task.id),
    ),
  );
  // Retire persisted empty results too, without rendering a transient attention row.
  $effect(() => {
    for (const task of selectionTasks) {
      if (!dismissedChecks.includes(task.id)
        && !selectionTasks.some(child => child.request.snapshot_id === task.id)
        && finishedWithoutDownloads(task, downloadContexts[task.id])) finishEmptyCheck(task);
    }
  });
  function finishEmptyCheck(task: SelectionTask) {
    const context = downloadContexts[task.id];
    if (context) downloadContexts[task.id] = { ...context, automatic: false, autoDownload: false };
    const completed = new Set([task.id, ...(task.request.snapshot_id ? [task.request.snapshot_id] : [])]);
    // Keep the engine's cached result; only retire its client-facing action item.
    dismissedChecks = [...new Set([...dismissedChecks, task.id])];
    readyNotices = readyNotices.filter(item => !completed.has(item.id));
    if (selectionTask && completed.has(selectionTask.id)) selectionTask = null;
    const parent = task.request.snapshot_id;
    const hasOtherWork = parent && (
      (downloadContexts[parent]?.selectedReleases?.length ?? 0) > 0 ||
      selectionTasks.some(other => other.id !== task.id && other.request.snapshot_id === parent
        && !finishedWithoutDownloads(other, downloadContexts[other.id]))
    );
    if (!hasOtherWork) noMissingNotice = `No new missing items${context?.title ? `: ${context.title}` : "."}`;
  }
  const preparingDownloads = $derived(
    visibleChecks.filter((task) => task.state === "working" || (task.state === "ready" && downloadContexts[task.id]?.selectedReleases && downloadContexts[task.id]?.autoDownload)),
  );
  const attentionChecks = $derived(
    visibleChecks.filter(
      (task) => !preparingDownloads.some((active) => active.id === task.id),
    ),
  );
  $effect(() => {
    localStorage.setItem(
      "omd.download-checks",
      JSON.stringify(downloadContexts),
    );
  });
  $effect(() => {
    localStorage.setItem(
      "omd.dismissed-checks",
      JSON.stringify(dismissedChecks),
    );
  });
  $effect(() => {
    for (const task of selectionTasks)
      if (
        task.kind === "snapshot" &&
        task.state === "ready" &&
        downloadContexts[task.id]?.automatic &&
        !dismissedChecks.includes(task.id) &&
        !advancingChecks.has(task.id) &&
        !selectionTasks.some((child) => child.request.snapshot_id === task.id)
      ) {
        const context = $state.snapshot(downloadContexts[task.id]);
        advancingChecks.add(task.id);
        void startCheckedBatch(task, context)
          .catch((e) => {
            notifyReady({
              ...task,
              state: "failed",
              issue: {
                code: "check_failed",
                message: text(e),
                retryable: true,
                actions: [],
              },
            });
            downloadContexts[task.id] = { ...context, automatic: false };
          })
          .finally(() => advancingChecks.delete(task.id));
      }
  });

  let readyNotices = $state<SelectionTask[]>([]);
  const readyNotice = $derived(readyNotices[0]);
  function notifyReady(task: SelectionTask, foreground = false) {
    if (finishedWithoutDownloads(task, downloadContexts[task.id])) { finishEmptyCheck(task); return; }
    const index = readyNotices.findIndex(
      (item) => item.id === task.id || item.id === task.request.snapshot_id,
    );
    if (foreground)
      readyNotices = [task, ...readyNotices.filter((_, i) => i !== index)];
    else if (index < 0) readyNotices.push(task);
    else
      readyNotices = readyNotices.map((item, i) => (i === index ? task : item));
  }
  const announcedChecks = new Set<string>();
  const autoSubmitting = new Set<string>();
  const currentCheck = $derived(
    details
      ? visibleChecks.find((task) => {
          const c = downloadContexts[task.id];
          return (
            c &&
            (!task.source_digest ||
              task.source_digest ===
                sources.find((s) => s.manifest.id === c.reference.provider)
                  ?.digest) &&
            sourceKey(c.reference) === sourceKey(details!.reference) &&
            c.destination_id === destinationId &&
            c.recipe === recipe &&
            (c.credential_profile ?? null) ===
              accountFor(details!.reference.provider) &&
            JSON.stringify(c.policy.languages ?? []) ===
              JSON.stringify(policy().languages ?? []) &&
            JSON.stringify(c.policy.groups ?? []) ===
              JSON.stringify(policy().groups ?? []) &&
            (c.policy.max_height ?? null) === (policy().max_height ?? null) &&
            JSON.stringify(c.policy.subtitle_languages ?? []) ===
              JSON.stringify(policy().subtitle_languages ?? []) &&
            Boolean(c.policy.automatic_subtitles) ===
              Boolean(policy().automatic_subtitles) &&
            reusableCheck(task)
          );
        })
      : undefined,
  );
  const startingCurrentCheck = $derived.by(
    () => !!details && startingChecks.includes(sourceKey(details.reference)),
  );
  const noticeChecking = $derived(
    readyNotice &&
      (readyNotice.state === "working" ||
        (readyNotice.state === "ready" &&
          ((readyNotice.kind === "snapshot" &&
            downloadContexts[readyNotice.id]?.automatic) ||
            (readyNotice.kind === "batch" &&
              downloadContexts[readyNotice.id]?.autoDownload &&
              missingCount(readyNotice) !== 0)))),
  );
  async function checkOutcomes(active: EngineClient, tasks: SelectionTask[]) {
    return Promise.all(
      tasks.map(async (task) => {
        if (
          task.kind !== "batch" ||
          task.state !== "ready" ||
          Object.keys(task.outcomes ?? {}).length ||
          task.total === 0
        )
          return task;
        // List responses omit outcomes. Reuse a completed result until it changes.
        const cached = selectionTasks.find(
          (item) =>
            item.id === task.id &&
            item.updated_at === task.updated_at &&
            item.state === task.state &&
            Object.keys(item.outcomes ?? {}).length,
        );
        return cached
          ? { ...task, outcomes: cached.outcomes }
          : active.request<SelectionTask>(`/v2/selections/${task.id}`);
      }),
    );
  }
  function missingCount(task: SelectionTask) {
    return Object.keys(task.outcomes ?? {}).length || task.total === 0
      ? (task.outcomes?.download ?? 0) + (task.outcomes?.new_version ?? 0)
      : null;
  }
  const checkMessage = $derived(
    readyNotice
      ? `${noticeChecking ? (downloadContexts[readyNotice.id]?.selectedReleases ? "Preparing downloads" : "Checking missing items") : readyNotice.state === "failed" ? "Download check needs attention" : readyNotice.state === "submitted" ? "Downloads added" : downloadContexts[readyNotice.id]?.empty ? "No downloadable items match your selection" : missingCount(readyNotice) === 0 ? "No missing items found" : missingCount(readyNotice) !== null ? `${missingCount(readyNotice)} missing ${missingCount(readyNotice) === 1 ? "item" : "items"} found` : "Download check ready"}${downloadContexts[readyNotice.id]?.title ? `: ${downloadContexts[readyNotice.id].title}` : ""}${readyNotice.issue ? `. ${checkIssue(readyNotice.issue)!.message}` : downloadContexts[readyNotice.id]?.leftOut ? `. ${downloadContexts[readyNotice.id].leftOut}` : ""}`
      : "",
  );
  $effect(() => {
    for (const task of visibleChecks) {
      if (task.state === "working") {
        announcedChecks.delete(`${task.id}:failed`);
        announcedChecks.delete(`${task.id}:ready`);
      }
      if (
        (task.kind !== "batch" && task.state !== "failed") ||
        !["ready", "failed"].includes(task.state) ||
        announcedChecks.has(`${task.id}:${task.state}`) ||
        (task.expires_at && new Date(task.expires_at).getTime() <= Date.now())
      )
        continue;
      announcedChecks.add(`${task.id}:${task.state}`);
      if (
        task.state === "ready" &&
        downloadContexts[task.id]?.autoDownload &&
        missingCount(task) !== 0
      ) {
        if (!autoSubmitting.has(task.id)) {
          autoSubmitting.add(task.id);
          void submitChecked(task)
            .catch((e) => {
              downloadContexts[task.id] = {
                ...downloadContexts[task.id],
                autoDownload: false,
              };
              notifyReady({
                ...task,
                state: "failed",
                issue: {
                  code: "download_start_failed",
                  message: text(e),
                  retryable: true,
                  actions: [],
                },
              });
            })
            .finally(() => autoSubmitting.delete(task.id));
        }
      } else notifyReady(task);
    }
  });
  async function submitChecked(task: SelectionTask) {
    if (!client) return;
    const submitted = await client.request<Submission>("/v2/jobs", {
      method: "POST",
      key: task.id,
      body: { preparation_id: task.id },
    });
    const group = await client.request<JobGroup>(
      `/v2/groups/${submitted.group_id}`,
    );
    if (selectionTask?.id === task.id) selectionTask = null;
    if (
      downloadContexts[task.id]?.selectedReleases ||
      readyNotices.some(
        (item) => item.id === task.id || item.id === task.request.snapshot_id,
      )
    )
      notifyReady({ ...task, state: "submitted" });
    else downloadNotice = { group, ...submissionCounts(submitted) };
    await Promise.all([
      refresh("jobs"),
      refresh("groups"),
      refresh("selections"),
    ]);
  }
  let preparation: Preparation | null = $state(null);
  let itemSubscriptions = $state<Subscription[]>([]);
  let collectionReturn = $state("Search");
  let collectionInfo = $state<{ snapshot: () => CollectionInfoSnapshot; showReleases: () => void }>();
  let initialCollectionInfo = $state<CollectionInfoSnapshot>();
  let itemTrail = $state<ReturnType<typeof collectionSnapshot>[]>([]);
  function collectionSnapshot() {
    return {
      collection: details!,
      info: collectionInfo?.snapshot(),
      account: accountFor(details!.reference.provider),
      sourceVersion: sources.find(
        (s) => s.manifest.id === details!.reference.provider,
      )?.manifest.version,
      releases,
      releaseCursor,
      selected: new Set(selected),
      selectionCatalog,
      language,
      loadedLanguage,
      collectionLanguages,
      languagesLoaded,
      group,
      releaseOrder,
      releaseLayout, releaseTable, releaseActive,
      error,
      pending: openingDetails || loadingReleases,
      recipe,
      maxHeight,
      subtitles,
      automaticSubtitles,
      scroll: main?.scrollTop ?? 0,
    };
  }
  let subscriptionTitle = $state<string | null>(null);
  let subscriptionBack = $state<() => void>(() => {});
  let sourceTitle = $state<string | null>(null);
  let sourceBack = $state<() => void>(() => {});
  async function loadItemSubscriptions(reference: SourceRef) {
    if (!client) return;
    const target=details && sourceKey(details.reference)===sourceKey(reference)?subscriptionTarget(details):reference;
    const rows = await client.listAll<Subscription>(
      `/v2/subscriptions?q=${encodeURIComponent(target.id)}`,
    );
    if (details && sourceKey(details.reference) === sourceKey(reference))
      itemSubscriptions = rows.filter(
        (s) => sourceKey(s.request.target) === sourceKey(target),
      );
  }
  let unsubscribeConfirm = $state(false);
  async function unsubscribeItem() {
    await run("Unsubscribing", async () => {
      for (const sub of itemSubscriptions)
        await client!.request(`/v2/subscriptions/${sub.id}/unsubscribe`, {
          method: "POST",
        });
      itemSubscriptions = [];
      unsubscribeConfirm = false;
      notice = "Unsubscribed.";
      await refresh("subscriptions");
    });
  }
  async function externalItem() {
    if (details?.canonical_url)
      await run("Opening source", () =>
        invoke("v2_open_source", { url: details!.canonical_url }),
      );
  }
  let subscribeOpen = $state(false);
  let searchSubscribeOpen = $state(false);
  let discoveryPage: Discovery | undefined = $state();
  const savedSearchInputs = $derived(Object.fromEntries(Object.entries(searchState.applied).filter(([id,input]) => input.operation === "search" && typeof input.query === "string" && input.query.trim() && sources.some(s=>s.manifest.id===id && s.manifest.capabilities.includes("search")))));
  const currentSearchSubscriptions = $derived(subscriptions.filter(sub=>Object.entries(savedSearchInputs).some(([id,input])=>sameSearch(sub,id,input))));
  const searchIsSubscribed = $derived(Object.keys(savedSearchInputs).length>0 && Object.keys(savedSearchInputs).every(id=>currentSearchSubscriptions.some(s=>s.request.target.provider===id)));
  async function openSearchSubscription(sub: Subscription) {
    accountProfiles[sub.request.target.provider] = sub.request.credential_profile ?? null;
    await navigate("Search");
    details = null;
    await tick();
    await discoveryPage?.openSavedSearch(sub);
  }
  let editingSubscription: Subscription | null = $state(null);
  let subscriptionDraft: SubscribeRequest | null = $state(null);
  let editLanguages = $state("");
  let editGroups = $state("");
  let futureOnly = $state(true);
  let automatic = $state(false);
  let schedule = $state(60);
  let sourceReview: any = $state(null);
  let packagePath = $state("");
  let destinationOpen = $state(false);
  let reconnecting: Destination | null = $state(null);
  let destinationName = $state("");
  let destinationPath = $state("");
  let filesOpen: Job | null = $state(null);
  let fileNotice = $state("");
  let files: Artifact[] = $state([]);
  let fileCursor: string | null = $state(null);
  let background = $state(false);
  let preferredLanguages = $state(preferredSystemLanguage()),
    preferenceConflict = $state(false);
  let preferenceBaseline = $state("");
  type Preferences = {
    background: boolean;
    bandwidth_bytes_per_second?: number;
    languages: string[];
    onboarding_complete?: boolean;
    startup?: { enabled: boolean; issue: Problem | null };
  };
  function applyPreferences(prefs: Preferences, force = false) {
    if (!prefs.onboarding_complete)
      prefs = { ...prefs, languages: languageList(preferredLanguages) };
    const incoming = {
      background: prefs.background,
      bandwidth_bytes_per_second: prefs.bandwidth_bytes_per_second ?? 0,
      languages: prefs.languages,
    };
    const draft = {
      background,
      bandwidth_bytes_per_second: Math.round(bandwidthKiB * 1024),
      languages: languageList(preferredLanguages),
    };
    const decision = reconcilePreferences(preferenceBaseline, draft, incoming);
    startupIssue = prefs.startup?.issue ?? null;
    if (force || decision.apply) {
      const old = languageList(preferredLanguages)[0] ?? "";
      preferredLanguages = prefs.languages.join(", ");
      if (language === old) language = prefs.languages[0] ?? "";
      background = prefs.background;
      bandwidthKiB = incoming.bandwidth_bytes_per_second / 1024;
      preferenceConflict = false;
    } else if (decision.conflict) preferenceConflict = true;
    preferenceBaseline = decision.key;
    onboarding = !prefs.onboarding_complete;
  }
  let bandwidthKiB = $state(0);
  const preferencesDirty = $derived(!!preferenceBaseline && preferenceKey({background,bandwidth_bytes_per_second:Math.round(bandwidthKiB*1024),languages:languageList(preferredLanguages)})!==preferenceBaseline);
  let startupIssue: Problem | null = $state(null);
  // The login-startup warning can be dismissed for this session.
  let startupIssueDismissed = $state(false);
  let onboarding = $state(false);
  let theme = $state(localStorage.getItem("omd.theme") ?? "system");
  const native =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  let lease = $state("");
  let heartbeat: ReturnType<typeof setInterval>;
  let events: AbortController;
  const invalidations = new ResourceInvalidation(refresh, (e) => {
    error = `Showing saved data. ${text(e)}`;
  });
  let releaseOrder = $state("asc");
  let collectionGeneration = 0,
    releaseGeneration = 0;
  let loadingReleases = $state(false);
  // A single item whose only releases can't be downloaded (for example, it needs an
  // account) has no output to choose; format controls would contradict the reason shown.
  const itemUnavailable = $derived.by(
    () =>
      details?.kind === "item" &&
      !loadingReleases &&
      releases.length > 0 &&
      releases.every((release) => release.availability !== "available"),
  );
  let loadedLanguage = $state("");
  const chapterOrder = new Intl.Collator(appLocale(), {
    numeric: true,
    sensitivity: "base",
  });
  const matchingReleases = $derived(
    releases
      .filter(
        (release) =>
          (mediaSource ||
            !loadedLanguage ||
            release.language === loadedLanguage) &&
          (mediaSource || !group || release.group === group),
      )
      .sort((a, b) =>
        mediaSource
          ? (audioSource && releaseOrder==="desc" ? -1 : 1)*(a.position - b.position)
          : (releaseOrder === "asc" ? 1 : -1) *
            (chapterOrder.compare(a.chapter ?? a.title, b.chapter ?? b.title) ||
              a.position - b.position),
      ),
  );
  const filtered = $derived(
    matchingReleases.filter((release) =>
      releaseVisible(
        release,
        showUnavailable,
        acquired[sourceKey(release.reference)],
        activeReleases.has(sourceKey(release.reference)),
      ),
    ),
  );
  const selectableReleases = $derived(
    (selectionCatalog.length ? selectionCatalog : matchingReleases).filter(
      (release) =>
        release.availability === "available" &&
        !activeReleases.has(sourceKey(release.reference)),
    ),
  );
  const allSelected = $derived(
    selectableReleases.length > 0 &&
      (!releaseCursor || selectionCatalog.length > 0) &&
      selectableReleases.every((release) => selected.has(release.reference.id)),
  );
  const groups = $derived([
    ...new Set(releases.map((release) => release.group).filter(Boolean)),
  ]);
  const policy = () => ({
    languages: !mediaSource && language ? [language] : [],
    groups: !mediaSource && group ? [group] : [],
    max_height: maxHeight,
    subtitle_languages: [
      ...new Set(
        subtitles
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    automatic_subtitles: automaticSubtitles,
  });
  function text(error: unknown) {
    return error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "The operation failed.";
  }
  async function quietRun(_label: string, action: () => Promise<void>) {
    await action();
  }
  async function run(label: string, action: () => Promise<void>) {
    const restoreFocus = actionFocus();
    busy = label;
    error = "";
    try {
      await action();
    } catch (e) {
      error = text(e);
    } finally {
      busy = "";
      await restoreFocus();
    }
  }
  function date(value: string | null | undefined) {
    return value ? formatDate(value) : "Never checked";
  }
  async function refresh(resource: string) {
    if (!client) return;
    const version = (refreshVersions[resource] ?? 0) + 1;
    refreshVersions[resource] = version;
    const connected = client;
    const current = () =>
      client === connected &&
      refreshVersions[resource] === version &&
      !disposed;
    if (resource === "sources") {
      const installed = await connected.listAll<Source>("/v2/sources");
      if (!current()) return;
      if (
        JSON.stringify(
          sources.map((s) => [s.manifest.id, s.digest, s.manifest.version]),
        ) !==
        JSON.stringify(
          installed.map((s) => [s.manifest.id, s.digest, s.manifest.version]),
        )
      ) {
        resetDisplayMemory();
      }
      configureDisplaySources(connected,installed);
      sources = installed;
      sourceId ||= sources[0]?.manifest.id ?? "";
      const catalog = await connected.listAll<{
        id: string;
        name: string;
        version: string;
        package_path: string;
        description?: string;
      }>("/v2/source-catalog");
      if (current())
        referencePackages = catalog.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          version: p.version,
          path: p.package_path,
        }));
    }
    if (resource === "destinations") {
      const roots = await connected.listAll<Destination>("/v2/destinations");
      if (!current()) return;
      destinations = roots;
      if (!destinations.some((d) => d.id === destinationId))
        destinationId =
          destinations.find((d) => d.root.endsWith("/Downloads/OMD"))?.id ??
          destinations[0]?.id ??
          "";
    }
    if (resource === "jobs") {
      acquisitionRevision++;
      const key = jobsKey(),
        query = appliedJobQuery,
        group = activeGroup?.id,
        state = "active";
      const page = await pageWindow<Job>(
        (cursor) =>
          group
            ? client!.request<Page<Job>>(
                `/v2/groups/${group}/jobs?${new URLSearchParams({ q: query, limit: "100", ...(cursor ? { cursor } : {}) })}`,
              )
            : client!.jobs(query, cursor, state),
        listTargets.get(key) ?? 100,
      );
      if (current() && jobsKey() === key) {
        jobs = page.items;
        jobCursor = page.next_cursor;
        if (!group) {
          rootJobs = page;
          rootJobQuery = query;
        }
      }
    }
    if (resource === "source-removals") removalRevision++;
    if (resource === "notifications") notificationRevision++;
    if (resource === "settings")
      applyPreferences(await client.request<Preferences>("/v2/settings"));
    if (resource === "credentials") {accountRevision++;resetDisplayMemory();}
    if (resource === "files") fileRevision++;
    if (resource === "storage") {
      storageRevision++;
      await refresh("destinations");
    }
    if (resource === "groups") {
      const query = appliedJobQuery;
      const page = await pageWindow<JobGroup>(
        async (cursor) => {
          const { data } = await client!.api.GET("/v2/groups", {
            params: {
              query: {
                q: query,
                state: "active",
                limit: 100,
                ...(cursor ? { cursor } : {}),
              },
            },
          });
          if (!data) throw new Error("OMD couldn’t load your downloads. Try again.");
          return { items: data.items, next_cursor: data.next_cursor ?? null };
        },
        listTargets.get(`groups:${query}`) ?? 100,
      );
      if (current() && appliedJobQuery === query) {
        jobGroups = page.items;
        groupsCursor = page.next_cursor;
      }
      if (activeGroup) {
        const id = activeGroup.id;
        try {
          const group = await client.request<JobGroup>(`/v2/groups/${id}`);
          if (current() && activeGroup?.id === id) activeGroup = group;
        } catch (e) {
          if (e instanceof EngineError && e.status === 404) {
            if (activeGroup?.id === id) leaveGroup();
          } else throw e;
        }
      }
    }
    if (resource === "selections") {
      const page = await pageWindow<SelectionTask>(
        (cursor) =>
          client!.request(
            `/v2/selections?${new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) })}`,
          ),
        listTargets.get("selections") ?? 100,
      );
      page.items = await checkOutcomes(connected, page.items);
      if (current()) {
        selectionTasks = page.items;
        readyNotices = readyNotices.map(
          (notice) =>
            page.items.find(
              (task) => task.id === notice.id && task.state === "working",
            ) ?? notice,
        );
        selectionsCursor = page.next_cursor;
        void hydrateCheckContexts(page.items);
      }
      if (selectionTask) {
        const id = selectionTask.id;
        const task = await client.request<SelectionTask>(
          `/v2/selections/${id}`,
        );
        if (current() && selectionTask?.id === id) selectionTask = task;
      }
    }
    if (resource === "subscriptions") {
      const items = await connected.listAll<Subscription>("/v2/subscriptions");
      if (current()) {
        subscriptions = items;
        subscriptionCursor = null;
        if (details) await loadItemSubscriptions(details.reference);
      }
    }
    if (resource === "inbox") {
      const page = await pageWindow<any>(
        (cursor) =>
          client!.request(
            `/v2/inbox?${new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) })}`,
          ),
        listTargets.get("inbox") ?? 100,
      );
      if (current()) {
        inbox = page.items;
        inboxCursor = page.next_cursor;
      }
    }
    if (resource === "summary") summary = await client.request("/v2/summary");
  }
  function invalidate(resource: string) {
    if (resource === "metadata") {
      invalidations.add("subscriptions");
      return;
    }
    invalidations.add(resource);
    if (resource === "jobs") invalidations.add("groups");
    if (["jobs", "subscriptions", "inbox"].includes(resource))
      invalidations.add("summary");
  }
  async function groupAction(action: "pause" | "cancel" | "resume") {
    if (!activeGroup || !client) return;
    const id = activeGroup.id;
    if (
      action === "cancel" &&
      !(await confirmCancel(activeGroup.active + activeGroup.paused + activeGroup.failed))
    )
      return;
    await run("Updating download operation", async () => {
      const { data: result } = await client!.api.POST(
        "/v2/groups/{id}/{action}",
        { params: { path: { id, action } } },
      );
      if (!result) throw new Error("OMD didn’t confirm that change. Refresh and try again.");
      notice = `${result.changed} jobs updated; ${result.unchanged} unchanged.${result.publishing ? ` ${result.publishing} already publishing will finish safely.` : ""}${result.checkpointing ? ` ${result.checkpointing} still checkpointing; resume again when paused.` : ""}`;
      await Promise.all([refresh("jobs"), refresh("groups")]);
    });
  }
  // macOS asks before OMD first writes into Downloads, and the engine's reply
  // waits for that answer. Opening must not: setup shows "Choose a folder"
  // until the default folder is registered, or the reason it couldn't be.
  async function createDefaultDestination(active: EngineClient) {
    try {
      const destination = await active.request<Destination>(
        "/v2/destinations/default",
        { method: "POST" },
      );
      if (client !== active) return;
      if (!destinations.some((d) => d.id === destination.id))
        destinations = [...destinations, destination];
      if (!destinations.some((d) => d.id === destinationId))
        destinationId = destination.id;
    } catch (e) {
      if (client === active && !destinations.some((d) => d.available))
        error = text(e);
    }
  }
  async function connect(connection: Connection) {
    clearInterval(heartbeat);
    events?.abort();
    resetDisplayMemory();
    client = new EngineClient(connection);
    const attached = await client.attach();
    lease = attached.id;
    const snapshot = await client.request<{ event_cursor: number }>(
      "/v2/service",
    );
    const prefs = await client.request<Preferences>("/v2/settings");
    if (native) {
      try {
        const locales = await invoke<string[]>("v2_system_languages");
        localStorage.setItem("omd.system-languages", JSON.stringify(locales));
        if (!prefs.onboarding_complete)
          preferredLanguages = preferredSystemLanguage(
            locales.length ? locales : navigator.languages,
          );
        if (!prefs.onboarding_complete) language = preferredLanguages;
      } catch {
        /* WebKit locale remains the fallback. */
      }
    }
    applyPreferences(prefs);
    // Listing destinations checks each folder on disk, which macOS can hold
    // behind a permission prompt (Downloads, a removable volume). Opening
    // does not wait for it; a default folder is created only if none exist.
    const active = client;
    void refresh("destinations").then(
      () => {
        if (native && !disposed && client === active && !destinations.length)
          void createDefaultDestination(active);
      },
      (e) => {
        if (client === active) error = text(e);
      },
    );
    await Promise.all(
      [
        "sources",
        "jobs",
        "groups",
        "subscriptions",
        "selections",
        "inbox",
        "summary",
      ].map(refresh),
    );
    if (disposed) {
      await client.detach(lease).catch(() => {});
      return;
    }
    heartbeat = setInterval(
      () =>
        client?.heartbeat(lease).catch(() => {
          void recoverConnection();
        }),
      5000,
    );
    events = new AbortController();
    void client.events(
      snapshot.event_cursor,
      (event) => {
        const resource = event.kind.split(".")[0];
        if (
          [
            "jobs",
            "groups",
            "sources",
            "metadata",
            "destinations",
            "storage",
            "files",
            "credentials",
            "source-removals",
            "notifications",
            "tools",
            "browser_tools",
            "settings",
            "subscriptions",
            "selections",
            "inbox",
          ].includes(resource)
        )
          invalidate(resource);
      },
      () => {
        void recoverConnection();
      },
      events.signal,
    );
  }
  async function recoverConnection() {
    if (recovering || disposed) return;
    recovering = true;
    connectionFailure = null;
    clearInterval(heartbeat);
    events?.abort();
    for (
      recoveryAttempt = 0;
      recoveryAttempt < 3 && !disposed;
      recoveryAttempt++
    ) {
      try {
        const saved = client?.connection;
        await startWhileEngineStops(async () => {
          const connection = native
            ? await invoke<Connection>("v2_bootstrap_engine")
            : saved;
          if (!connection) throw new Error("No saved connection.");
          await connect(connection);
        });
        recovering = false;
        connectionFailure = null;
        return;
      } catch (e) {
        connectionFailure = startupFailure(e);
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (recoveryAttempt + 1)),
        );
      }
    }
    if (!disposed) {
      client = null;
      recovering = false;
    }
  }
  async function startNative() {
    if (starting) return;
    starting = true;
    connectionFailure = null;
    detailsNotice = "";
    try {
      await startWhileEngineStops(async () =>
        connect(await invoke<Connection>("v2_bootstrap_engine")),
      );
    } catch (e) {
      client = null;
      connectionFailure = startupFailure(e);
    } finally {
      starting = false;
    }
  }
  onMount(() => {
    const contextMenu = (event: MouseEvent) => event.preventDefault();
    const browserKey = (event: KeyboardEvent) => {
      if (
        event.key === "F5" ||
        event.key === "F12" ||
        ((event.metaKey || event.ctrlKey) &&
          (event.key.toLowerCase() === "r" ||
            (event.altKey &&
              ["i", "j", "c"].includes(event.key.toLowerCase()))))
      )
        event.preventDefault();
    };
    window.addEventListener("contextmenu", contextMenu);
    window.addEventListener("keydown", browserKey);
    // Native window activation drives the inactive-window sidebar treatment.
    const stopWindowActivity = trackWindowActivity();
    return () => {
      window.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("keydown", browserKey);
      stopWindowActivity();
    };
  });
  onMount(() => {
    if (!["system", "light", "dark"].includes(theme)) theme = "system";
    setTheme();
    restoreCustomTheme();
    const stopTrackingDialogs = trackDialogTriggers();
    void (async () => {
      try {
        if (native) {
          await startNative();
        } else {
          const response = await fetch("/omd-development-connection");
          if (response.ok) await connect(await response.json());
        }
      } catch (e) {
        client = null;
        connectionFailure = startupFailure(e);
      } finally {
        // Startup has a result on screen; main.ts stops treating errors as fatal.
        window.dispatchEvent(new Event(STARTUP_SETTLED));
      }
    })();
    // The app's version (what @tauri-apps/api/app getVersion() invokes).
    if (native)
      invoke<string>("plugin:app|version")
        .then((version) => {
          if (typeof version === "string") appVersion = version;
        })
        .catch(() => {});
    return () => {
      disposed = true;
      stopTrackingDialogs();
      clearInterval(heartbeat);
      invalidations.dispose();
      events?.abort();
      // The service may already be gone on exit; its lease timeout is the fallback.
      if (client && lease) void client.detach(lease).catch(() => {});
    };
  });
  let main: HTMLElement | undefined = $state();
  const savedScroll = new Map<string, number>();
  const surfaceKey = () =>
    view === "Search" && details
      ? `${view}:${sourceKey(details.reference)}`
      : view;
  function rememberScroll() {
    if (main) savedScroll.set(surfaceKey(), main.scrollTop);
  }
  async function restoreScroll(key = surfaceKey()) {
    await tick();
    if (main && surfaceKey() === key)
      main.scrollTop = savedScroll.get(key) ?? 0;
  }
  function closeCollection() {
    rememberScroll();
    collectionGeneration++;
    bulkGeneration++;
    selecting = false;
    releaseGeneration++;
    const parent = itemTrail.at(-1);
    itemTrail = itemTrail.slice(0, -1);
    openingDetails = false;
    loadingReleases = false;
    if (parent) {
      initialCollectionInfo = parent.info;
      details = parent.collection;
      configureSource(details.reference.provider);
      releases = parent.releases;
      releaseCursor = parent.releaseCursor;
      selected = parent.selected;
      selectionCatalog = parent.selectionCatalog;
      language = parent.language;
      loadedLanguage = parent.loadedLanguage;
      collectionLanguages = parent.collectionLanguages;
      languagesLoaded = parent.languagesLoaded;
      group = parent.group;
      releaseOrder = parent.releaseOrder;
      releaseLayout=parent.releaseLayout; releaseTable=parent.releaseTable; releaseActive=parent.releaseActive;
      error = parent.error;
      recipe = parent.recipe;
      maxHeight = parent.maxHeight;
      subtitles = parent.subtitles;
      automaticSubtitles = parent.automaticSubtitles;
      itemSubscriptions = [];
      savedScroll.set(surfaceKey(), parent.scroll);
      const currentSource = sources.find(
        (s) => s.manifest.id === details!.reference.provider,
      );
      if (
        parent.pending ||
        parent.account !== accountFor(details.reference.provider) ||
        parent.sourceVersion !== currentSource?.manifest.version
      ) {
        void openCollection(parent.collection, false);
      } else {
        void loadItemSubscriptions(details.reference).catch(() => {});
        // Downloads may have finished while a child item was open.
        if (client && releases.length)
          void loadAcquired(client, releases.map((release) => release.reference));
        void restoreScroll();
      }
      return;
    }
    details = null;
    initialCollectionInfo = undefined;
    error = "";
    view = collectionReturn;
    void restoreScroll();
  }

  async function editSearch() {
    rememberScroll();
    searchState.editing = true;
    await tick();
    if (main) main.scrollTop = 0;
    main?.querySelector<HTMLInputElement>(".search-form input")?.focus();
  }
  function leaveGroup() {
    activeGroup = null;
    jobs = rootJobs.items;
    jobCursor = rootJobs.next_cursor;
    appliedJobQuery = jobQuery = rootJobQuery;
  }
  /** From a source's settings to its catalog in Explore (or its search). */
  async function browseSource(provider: string) {
    if (details) {
      itemTrail = [];
      closeCollection();
    }
    await navigate("Search");
    discoveryPage?.browseSource(provider);
  }
  async function navigate(name: string) {
    notice = "";
    downloadAttention = false;
    rememberScroll();
    const previous = view;
    view = name;
    if (previous !== name && activeGroup) {
      leaveGroup();
    }
    if (previous !== name) {
      collectionGeneration++;
      bulkGeneration++;
      selecting = false;
      releaseGeneration++;
      // An abandoned partial screen must not be restored with a canceled loader.
      if (openingDetails || loadingReleases) details = null;
      openingDetails = false;
      loadingReleases = false;
    }
    error = "";
    if (previous !== name) historyTitle = null;
    // Engine events keep these snapshots current; navigation does not refetch them.
    await restoreScroll();
  }
  async function openCollection(collection: Collection, remember = true, savedContext?: DownloadContext, refreshMetadata = false) {
    if (!client) return;
    if (remember) {
      if (
        view === "Search" &&
        details &&
        sourceKey(details.reference) === sourceKey(collection.reference)
      )
        return;
      rememberScroll();
      if (view === "Search" && details)
        itemTrail = [...itemTrail, collectionSnapshot()];
      else {
        itemTrail = [];
        collectionReturn = view;
      }
      initialCollectionInfo = undefined;
    }
    view = "Search";
    itemSubscriptions = [];
    const version = ++collectionGeneration;
    bulkGeneration++;
    selecting = false;
    releaseGeneration++;
    const provider = collection.reference.provider;
    if (savedContext?.credential_profile !== undefined) accountProfiles[provider] = savedContext.credential_profile;
    const account = accountFor(provider);
    const supportsDetails = !!sources
      .find((s) => s.manifest.id === provider)
      ?.manifest.capabilities.includes("details");
    const cachedInfo = cachedItemMetadata<CollectionDetails>(
      client,
      collection,
      "details",
      account,
    );
    configureSource(provider, isAudioCollection(collection));
    if(isAudioCollection(collection)){releaseLayout="compact";releaseTable=false;releaseOrder="desc";}

    preserveReleaseLanguage = !!savedContext;
    group = ((savedContext?.policy.groups as string[] | undefined) ?? [])[0] ?? "";
    const preferred = languageList(preferredLanguages)[0] ?? "";
    language =
      cachedInfo && !cachedInfo.languages.includes(preferred) ? "" : preferred;
    if (savedContext) {
      language = ((savedContext.policy.languages as string[] | undefined) ?? [])[0] ?? "";
      destinationId = savedContext.destination_id;
      recipe = savedContext.recipe;
      maxHeight = Number(savedContext.policy.max_height ?? maxHeight);
      subtitles = ((savedContext.policy.subtitle_languages as string[] | undefined) ?? []).join(",");
      automaticSubtitles = savedContext.policy.automatic_subtitles === true;
    }
    loadedLanguage = language;
    collectionLanguages =
      cachedInfo?.languages ?? collection.summary?.languages ?? [];
    languagesLoaded = !!cachedInfo || !!collection.summary?.languages;
    selected = new Set();
    releases = [];
    releaseActive=0;
    releaseCursor = null;
    error = "";
    loadingReleases = true;
    openingDetails = true;
    // Navigation commits before any source request resolves. A cache hit can
    // enrich the first frame; a cache miss must never delay click feedback.
    details =
      cachedItemMetadata<Collection>(
        client,
        collection,
        "collection",
        account,
      ) ?? collection;
    void loadItemSubscriptions(collection.reference).catch(() => {});
    void restoreScroll();
    if (savedContext) { await tick(); collectionInfo?.showReleases(); }
    const initialLanguage = language;
    const initialReleases = loadReleases(false);
    const result = await mainItem(client, collection, supportsDetails, account, refreshMetadata);
    if (version !== collectionGeneration) return;
    details = result.collection;
    if (result.info) {
      collectionLanguages = result.info.languages;
      languagesLoaded = true;
      if (!savedContext && language && !collectionLanguages.includes(language)) language = "";
    }
    openingDetails = false;
    if (language !== initialLanguage) await loadReleases(false);
    else await initialReleases;
  }

  async function loadReleases(more: boolean) {
    const version = ++releaseGeneration;
    const requestedLanguage = language;
    loadingReleases = true;
    if (!more) {
      releases = [];
      releaseCursor = null;
      clearSelection();
    }
    try {
      if (!client || !details || details.summary?.image || details.summary?.profile || details.summary?.sections?.find(s=>s.reference.id===details!.reference.id)?.kind === "collections") return;
      if(audioSource && details.kind==="item"){
        const existing=itemTrail.at(-1)?.releases.find(r=>sourceKey(r.reference)===sourceKey(details!.reference));
        releases=existing?[existing]:[];return;
      }
      const active = client,
        collection = details;
      const input = {
        operation: "releases" as const,
        release_order: mediaSource && !audioSource ? null : (releaseOrder as "asc" | "desc"),
        credential_profile: accountFor(collection.reference.provider),
        reference: collection.reference,
        page_size: 100,
        policy: policy(),
      };
      let cursor = more ? releaseCursor : null;
      const seen = new Set<string>();
      const collected: Release[] = [];
      const statuses: Record<string, AcquisitionStatus> = {};
      let statusError = "";
      // Skip pages containing only hidden releases without flashing a false empty state.
      do {
        if (cursor) {
          if (seen.has(cursor))
            throw new Error("The source repeated a releases page. Try again.");
          seen.add(cursor);
        }
        const page = await sectionPage<Release>(
          active,
          collection.reference.provider,
          { ...input, cursor },
          sources.find((s) => s.manifest.id === collection.reference.provider)
            ?.manifest.version,
        );
        if (version !== releaseGeneration) return;
        try {
          Object.assign(
            statuses,
            await releaseStatuses(
              active,
              page.items.map((r) => r.reference),
            ),
          );
        } catch (e) {
          statusError = text(e);
        }
        if (version !== releaseGeneration) return;
        collected.push(...page.items);
        cursor = page.next_cursor;
        if (
          collected.some(
            (r) =>
              (!requestedLanguage ||
                r.language === requestedLanguage ||
                mediaSource) &&
              (!group || r.group === group || mediaSource) &&
              releaseVisible(
                r,
                showUnavailable,
                statuses[sourceKey(r.reference)],
              ),
          )
        )
          break;
      } while (cursor);
      let activeJobs = activeReleases;
      try {
        activeJobs = await activeReleaseKeys(active);
      } catch (e) {
        statusError = text(e);
      }
      if (version !== releaseGeneration) return;
      acquiredRequest++;
      acquired = { ...acquired, ...statuses };
      acquiredError = statusError;
      acquiredLoading = false;
      activeReleases = activeJobs;
      loadedLanguage = requestedLanguage;
      releases = [
        ...new Map(
          [...(more ? releases : []), ...collected].map((r) => [
            sourceKey(r.reference),
            r,
          ]),
        ).values(),
      ];
      releaseCursor = cursor;
    } catch (e) {
      if (version === releaseGeneration) {
        error = text(e);
        language = loadedLanguage;
      }
    } finally {
      if (version === releaseGeneration) loadingReleases = false;
    }
  }
  async function openUrl() {
    await run("Resolving link", async () => {
      if (!client) return;
      const version = ++collectionGeneration;
      const origin = view;
      const parsed = new URL(url);
      const source = sources.find((source) =>
        source.manifest.source_hosts.includes(parsed.hostname),
      );
      if (!source)
        throw new Error("Install a source that supports this URL first.");
      configureSource(source.manifest.id);
      const identified = await client.operation<IdentifiedSource>(
        source.manifest.id,
        {
          operation: "identify",
          credential_profile: accountFor(source.manifest.id),
          url,
        },
      );
      if (version !== collectionGeneration || view !== origin) return;
      const reference = identified.reference;
      if (identified.kind === "release") {
        pendingReferences = [reference];
        return;
      }
      const collection = await client.operation<Collection>(
        source.manifest.id,
        {
          operation: "collection",
          reference,
          credential_profile: accountFor(source.manifest.id),
        },
      );
      if (version !== collectionGeneration || view !== origin) return;
      await openCollection(collection);
    });
  }
  function select(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    selected = next;
  }
  async function prepareReferences(references: SourceRef[]) {
    if (!client) return;
    if (!destinationId) throw new Error("Add a destination in Settings first.");
    saveOutputPreferences(outputKind(mediaSource, audioSource), {
      recipe,
      maxHeight,
      subtitles,
      automaticSubtitles,
    });
    preparation = await client.request<Preparation>("/v2/preparations", {
      method: "POST",
      body: {
        releases: references,
        credential_profile: accountFor(references[0].provider),
        destination_id: destinationId,
        recipe,
        policy: policy(),
      },
    });
  }
  async function prepareAnotherVersion(job: Job) {
    await run("Checking another copy", async () => {
      if (!client) return;
      const preview = await client.request<Preparation>("/v2/preparations", {
        method: "POST",
        body: {
          releases: [job.plan.release.reference],
          destination_id: job.destination_id,
          recipe: job.plan.recipe,
          policy: job.plan.policy,
          credential_profile: job.plan.credential_profile,
          duplicate_behavior: "new_version",
        },
      });
      filesOpen = null;
      preparation = preview;
    });
  }
  // A failed download whose issue would fail again is prepared again in another format.
  let anotherFormat = $state<FormatChoice | null>(null);
  function chooseAnotherFormat(job: Job) {
    anotherFormat = formatChoice(
      {
        title: job.title,
        reference: job.plan.release.reference,
        destination_id: job.destination_id,
        credential_profile: job.plan.credential_profile,
        policy: job.plan.policy,
        recipe: job.plan.recipe,
      },
      {
        media: isMedia(job.plan.release.reference.provider),
        audio: isAudioCollection(job.plan.collection),
      },
    );
  }
  // A subscription's automatic download keeps the subscription's destination and filters.
  type InboxRelease = { subscription_id: string; release: Release };
  const inboxSubscription = (item: InboxRelease) =>
    subscriptions.find((sub) => sub.id === item.subscription_id);
  function chooseInboxFormat(item: InboxRelease, sub: Subscription) {
    anotherFormat = formatChoice(
      {
        title: item.release.title,
        reference: item.release.reference,
        destination_id: sub.request.destination_id,
        credential_profile: sub.request.credential_profile,
        policy: sub.request.policy,
        recipe: sub.request.recipe,
      },
      {
        media: isMedia(item.release.reference.provider),
        audio: !!item.release.preview && isAudioCollection(item.release.preview),
      },
    );
  }
  async function prepareAnotherFormat() {
    await run("Checking files", async () => {
      if (!client || !anotherFormat) return;
      const choice = anotherFormat;
      const preview = await client.request<Preparation>("/v2/preparations", {
        method: "POST",
        body: formatPreparation(choice),
      });
      if (anotherFormat !== choice) return;
      anotherFormat = null;
      preparation = preview;
    });
  }
  let imageDetailDownload = $state<Collection[] | null>(null);
  async function prepareImages(items: Collection[], destination: string) {
    if (!client) throw new Error('Reconnect to OMD and try again.');
    for (const group of imageGroups(items)) {
      const references = group.map(imageRelease), first = group[0];
      const task = await client.request<SelectionTask>('/v2/snapshots', { method:'POST', body: {
        reference:first.reference, release_refs:references, credential_profile:accountFor(first.reference.provider),
      }});
      if(advancingChecks.has(task.id) || (downloadContexts[task.id]?.automatic && task.state === 'working' && !dismissedChecks.includes(task.id))) continue;
      const context: DownloadContext = {title:`${group.length} image ${group.length === 1 ? 'post' : 'posts'}`, reference:first.reference, destination_id:destination, recipe:'original_images', policy:{languages:[]}, credential_profile:accountFor(first.reference.provider), selectedReleases:references, automatic:true, autoDownload:false};
      downloadContexts[task.id] = context;
      dismissedChecks = dismissedChecks.filter(id => id !== task.id);
      selectionTasks = [...selectionTasks.filter(t => t.id !== task.id), task];
      notifyReady(task, true);
      if(task.state === 'ready') { advancingChecks.add(task.id); try { await startCheckedBatch(task, context); } finally { advancingChecks.delete(task.id); } }
    }
    await refresh('selections');
  }
  async function prepareSelected() {
    if (
      !client ||
      !details ||
      queueingSelection ||
      startingCurrentCheck ||
      !selected.size
    )
      return;
    const active = client,
      collection = details,
      scope = selectionScope();
    const draft: DownloadDraft = {
      context: {
        title: collection.title,
        reference: collection.reference,
        destination_id: destinationId,
        recipe,
        policy: policy(),
        credential_profile: accountFor(collection.reference.provider),
        autoDownload: true,
      },
      language,
      group,
      maxHeight,
      subtitles,
      automaticSubtitles,
      languages: collectionLanguages,
      groups: groups.filter((g): g is string => !!g),
    };
    const candidates = [
      ...new Map(
        [...selectionCatalog, ...releases]
          .filter(
            (r) =>
              selected.has(r.reference.id) && r.availability === "available",
          )
          .map((r) => [sourceKey(r.reference), r]),
      ).values(),
    ];
    queueingSelection = true;
    checkStartError = "";
    try {
      const [statuses, activeJobs] = await Promise.all([
        releaseStatuses(
          active,
          candidates.map((r) => r.reference),
        ),
        activeReleaseKeys(active),
      ]);
      draft.context.selectedReleases = candidates
        .filter((r) =>
          matchesBulkSelection(r, "missing_files", statuses, activeJobs),
        )
        .map((r) => r.reference);
      if (draft.context.selectedReleases.length)
        await beginDownloadCheck(draft);
      else
        notice =
          "Selected items are already downloaded, in Downloads, or their files could not be checked.";
      if (!checkStartError && scope === selectionScope()) clearSelection();
    } catch (e) {
      checkStartError = `Could not start downloads for ${collection.title}. ${text(e)}`;
    } finally {
      queueingSelection = false;
    }
  }

  function dismissCheck(task: SelectionTask, undo = true) {
    if (undo) dismissedUndo = { ids: [...(dismissedUndo?.ids ?? []), task.id], title: downloadContexts[task.id]?.title ?? "Review" };
    readyNotices = readyNotices.filter((notice) => notice.id !== task.id);
    dismissedChecks = [...new Set([...dismissedChecks, task.id])];
    if (selectionTask?.id === task.id) selectionTask = null;
    if (undo) void tick().then(() => document.getElementById("undo-review-dismissal")?.focus());
  }
  async function hydrateCheckContexts(tasks: SelectionTask[]) {
    if (!client) return;
    for (const task of tasks) {
      if (downloadContexts[task.id] || contextLookups.has(task.id)) continue;
      contextLookups.add(task.id);
      try {
        const parent = task.request.snapshot_id
          ? (tasks.find((t) => t.id === task.request.snapshot_id) ??
            (await client.request<SelectionTask>(
              `/v2/selections/${task.request.snapshot_id}`,
            )))
          : task;
        const reference = parent.request.reference;
        if (!reference) continue;
        const saved = downloadContexts[parent.id];
        const collection = saved
          ? null
          : await client.operation<Collection>(reference.provider, {
              operation: "collection",
              reference,
              credential_profile: parent.request.credential_profile,
            });
        downloadContexts[task.id] = {
          title: saved?.title ?? collection?.title ?? "Collection",
          reference,
          destination_id: task.request.destination_id ?? destinationId,
          recipe: task.request.recipe ?? recipe,
          policy: task.request.policy ?? saved?.policy ?? {},
          credential_profile: parent.request.credential_profile,
          automatic: false,
        };
      } catch {
        contextLookups.delete(task.id);
      }
    }
  }
  async function openCheck(task: SelectionTask) {
    if (finishedWithoutDownloads(task, downloadContexts[task.id])) { finishEmptyCheck(task); return; }
    if (!downloadContexts[task.id]?.selectedReleases && task.state !== "working") {
      if (task.state === "failed") await navigate("Downloads");
      else await chooseCheckOptions(task);
      return;
    }
    await run("Opening download review", async () => {
      await hydrateCheckContexts([task]);
      selectionTask = await client!.request<SelectionTask>(
        `/v2/selections/${task.id}`,
      );
      if (
        selectionTask.kind === "batch" &&
        selectionTask.state === "ready" &&
        (!downloadContexts[selectionTask.id]?.autoDownload ||
          missingCount(selectionTask) === 0) &&
        (!selectionTask.expires_at ||
          new Date(selectionTask.expires_at).getTime() > Date.now())
      )
        await reviewBatch();
    });
  }
  async function chooseCheckOptions(task: SelectionTask) {
    const origin = view, generation = collectionGeneration;
    await run("Opening chapters", async () => {
      await hydrateCheckContexts([task]);
      if (view !== origin || generation !== collectionGeneration) return;
      const context = downloadContexts[task.id];
      if (!context) throw new Error("The source is unavailable. Install or reconnect it, then try again.");
      selectionTask = null;
      downloadDraft = null;
      await openCollection({ reference: context.reference, title: context.title, kind: isMedia(context.reference.provider) ? "channel" : "manga", canonical_url: "" }, true, context);
      await tick();
      if (view === "Search" && details && sourceKey(details.reference) === sourceKey(context.reference)) {
        const target = document.getElementById(context.empty || task.state === "failed" ? "release-filters" : "release-selection");
        target?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: "start" });
      }
    });
  }
  async function checkRowAction(task: SelectionTask, action: "cancel" | "retry") {
    await run(action === "cancel" ? "Canceling check" : "Retrying check", async () => {
      if (!client) return;
      await client.request(`/v2/selections/${task.id}/${action}`, { method: "POST" });
      if (action === "cancel") dismissCheck(task, false);
      else if (downloadContexts[task.id]) downloadContexts[task.id] = { ...downloadContexts[task.id], empty: false };
      await refresh("selections");
    });
  }
  /**
   * Rebuilds a check that failed because its items changed on the source after
   * listing. The same collection is listed again; a check of named releases then
   * batches only those, matched against the new list, and says which are gone.
   * Preparing them directly would let a release resolve under another collection
   * of the source. The failed check is retired.
   */
  async function refreshCheck(task: SelectionTask) {
    await run("Refreshing from the source", async () => {
      if (!client) return;
      const active = client;
      const snapshot = task.request.snapshot_id
        ? await active.request<SelectionTask>(`/v2/selections/${task.request.snapshot_id}`)
        : task;
      const reference = snapshot.request.reference;
      if (!reference)
        throw new Error("The source is unavailable. Install or reconnect it, then try again.");
      const saved = downloadContexts[task.id] ?? downloadContexts[snapshot.id];
      const named =
        task.request.releases ?? snapshot.request.release_refs ?? saved?.selectedReleases;
      const context: DownloadContext = {
        title: saved?.title ?? "Collection",
        reference,
        destination_id: task.request.destination_id ?? saved?.destination_id ?? destinationId,
        recipe: task.request.recipe ?? saved?.recipe ?? recipe,
        policy: task.request.policy ?? saved?.policy ?? {},
        credential_profile: snapshot.request.credential_profile ?? null,
        automatic: true,
        autoDownload: saved?.autoDownload ?? false,
        empty: false,
      };
      if (named?.length) {
        context.selectedReleases = named;
        context.reconcile = true;
      }
      const next = await active.request<SelectionTask>("/v2/snapshots", {
        method: "POST",
        body: {
          reference,
          credential_profile: context.credential_profile,
          ...(snapshot.request.release_refs
            ? { release_refs: snapshot.request.release_refs }
            : {}),
          // A failed list is listed again as it was. A batch's ready list is reused by
          // the engine for 15 minutes unless the request differs, so it carries the
          // batch's own policy (enumeration doesn't filter by it).
          ...(task.kind === "batch" ? { policy: context.policy } : {}),
        },
      });
      // The engine reuses a recent identical list; that one still has the old items.
      if (next.id === snapshot.id)
        throw new Error(
          "OMD listed this source only a few minutes ago. Try Refresh again in 15 minutes.",
        );
      dismissCheck(task, false);
      downloadContexts[next.id] = context;
      dismissedChecks = dismissedChecks.filter((id) => id !== next.id);
      selectionTasks = [...selectionTasks.filter((item) => item.id !== next.id), next];
      notifyReady(next, true);
      if (next.state === "ready" && !advancingChecks.has(next.id)) {
        advancingChecks.add(next.id);
        try {
          await startCheckedBatch(next, context);
        } finally {
          advancingChecks.delete(next.id);
        }
      }
      await refresh("selections");
    });
  }
  async function beginDownloadCheck(
    draft: DownloadDraft | null = downloadDraft
      ? $state.snapshot(downloadDraft)
      : null,
  ) {
    if (!client || !draft) return;
    const key = sourceKey(draft.context.reference);
    if (startingChecks.includes(key)) return;
    startingChecks = [...startingChecks, key];
    checkStartError = "";
    downloadDraft = null;
    let startedTask: SelectionTask | undefined;
    try {
      const media = isMedia(draft.context.reference.provider);
      const context: DownloadContext = {
        ...draft.context,
        empty: false,
        automatic: true,
        policy: {
          ...draft.context.policy,
          languages: !media && draft.language ? [draft.language] : [],
          groups: !media && draft.group ? [draft.group] : [],
          max_height: draft.maxHeight,
          subtitle_languages: draft.subtitles
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          automatic_subtitles: draft.automaticSubtitles,
        },
      };
      saveOutputPreferences(
        outputKind(
          media,
          !!details &&
            sourceKey(details.reference) === key &&
            isAudioCollection(details),
        ),
        {
          recipe: context.recipe,
          maxHeight: draft.maxHeight,
          subtitles: draft.subtitles,
          automaticSubtitles: draft.automaticSubtitles,
        },
      );
      const task =
        draft.snapshot ??
        (await client.request<SelectionTask>("/v2/snapshots", {
          method: "POST",
          body: {
            reference: context.reference,
            credential_profile: context.credential_profile,
          },
        }));
      downloadContexts[task.id] = context;
      downloadDraft = null;
      dismissedChecks = dismissedChecks.filter((id) => id !== task.id);
      startedTask = task;
      selectionTasks = [
        ...selectionTasks.filter((item) => item.id !== task.id),
        task,
      ];
      notifyReady(task, true);
      if (task.state === "ready") {
        advancingChecks.add(task.id);
        try {
          await startCheckedBatch(task, context);
        } finally {
          advancingChecks.delete(task.id);
        }
      }
      await refresh("selections");
    } catch (e) {
      if (startedTask) {
        downloadContexts[startedTask.id] = {
          ...downloadContexts[startedTask.id],
          automatic: false,
        };
        notifyReady({
          ...startedTask,
          state: "failed",
          issue: {
            code: "check_start_failed",
            message: text(e),
            retryable: true,
            actions: [],
          },
        });
      } else
        checkStartError = `Could not start the download check for ${draft.context.title}. ${text(e)}`;
    } finally {
      startingChecks = startingChecks.filter((item) => item !== key);
    }
  }
  async function startCheckedBatch(
    task: SelectionTask,
    context: DownloadContext,
  ) {
    if (!client) return;
    if (context.reconcile && context.selectedReleases) {
      context = await reconcileRefreshed(task, context);
      if (!context.selectedReleases) return;
    }
    // Count from the saved release list using the same criteria as the engine,
    // so an empty selection is explained before attempting a batch.
    let matching = context.selectedReleases?.length ?? 0,
      cursor: string | null = null;
    const languages = (context.policy.languages as string[]) ?? [],
      groups = (context.policy.groups as string[]) ?? [];
    if (!context.selectedReleases)
      do {
        const page: Page<Release> = await client.request(
          `/v2/snapshots/${task.id}/releases?limit=200${cursor ? `&cursor=${cursor}` : ""}`,
        );
        matching += page.items.filter(
          (r) =>
            r.availability === "available" &&
            (!languages.length ||
              !r.language ||
              languages.includes(r.language)) &&
            (!groups.length || (!!r.group && groups.includes(r.group))),
        ).length;
        cursor = page.next_cursor;
      } while (cursor);
    if (dismissedChecks.includes(task.id)) return;
    if (!matching) {
      downloadContexts[task.id] = { ...context, automatic: false, empty: true };
      finishEmptyCheck(task);
      return;
    }
    const chunks: (SourceRef[] | undefined)[] = [];
    if (context.selectedReleases) {
      for (let i = 0; i < context.selectedReleases.length; i += 2000)
        chunks.push(context.selectedReleases.slice(i, i + 2000));
    } else chunks.push(undefined);
    // Persist remaining membership after each successful batch for safe continuation.
    for (const references of chunks) {
      const batch = await client.request<SelectionTask>("/v2/batches", {
        method: "POST",
        body: {
          snapshot_id: task.id,
          ...(references ? { releases: references } : {}),
          destination_id: context.destination_id,
          recipe: context.recipe,
          policy: context.policy,
        },
      });

      downloadContexts[batch.id] = { ...context, automatic: false };
      dismissedChecks = dismissedChecks.filter((id) => id !== batch.id);
      if (selectionTask?.id === task.id) selectionTask = batch;
      selectionTasks = [
        ...selectionTasks.filter((item) => item.id !== batch.id),
        batch,
      ];
      notifyReady(batch, true);
      if (references) {
        const sent = new Set(references.map(sourceKey));
        downloadContexts[task.id] = {
          ...context,
          selectedReleases: (
            downloadContexts[task.id]?.selectedReleases ?? []
          ).filter((r) => !sent.has(sourceKey(r))),
        };
      }
    }
    downloadContexts[task.id] = {
      ...downloadContexts[task.id],
      automatic: false,
    };
    await refresh("selections");
  }
  /**
   * Keeps the refreshed selection's releases that the new listing still has and
   * can batch, and tells the person about the rest. With none left, the check is
   * reported and left for choosing again.
   */
  async function reconcileRefreshed(task: SelectionTask, context: DownloadContext): Promise<DownloadContext> {
    const listed: Release[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<Release> = await client!.request(
        `/v2/snapshots/${task.id}/releases?limit=200${cursor ? `&cursor=${cursor}` : ""}`,
      );
      listed.push(...page.items);
      cursor = page.next_cursor;
    } while (cursor);
    const result = reconcileSelection(context.selectedReleases ?? [], listed, context.policy);
    const message = reconcileNotice(context.title, result);
    if (!result.kept.length) {
      const left = { ...context, selectedReleases: undefined, reconcile: false, automatic: false, autoDownload: false, leftOut: message! };
      downloadContexts[task.id] = left;
      notifyReady({ ...task, state: "failed", issue: { code: "selection_gone", message: message!, retryable: false, actions: [] } });
      return left;
    }
    const next = { ...context, selectedReleases: result.kept, reconcile: false, leftOut: message ?? undefined };
    downloadContexts[task.id] = next;
    return next;
  }
  async function selectionAction(action: "cancel" | "retry") {
    await run(
      action === "cancel" ? "Canceling check" : "Continuing check",
      async () => {
        if (!client || !selectionTask) return;
        selectionTask = await client.request<SelectionTask>(
          `/v2/selections/${selectionTask.id}/${action}`,
          { method: "POST" },
        );
        if (action === "cancel") dismissCheck(selectionTask, false);
        else if (downloadContexts[selectionTask.id]) downloadContexts[selectionTask.id] = { ...downloadContexts[selectionTask.id], empty: false };
        await refresh("selections");
      },
    );
  }
  async function reviewBatch() {
    if (!selectionTask || openingReviews.has(selectionTask.id)) return;
    const id = selectionTask.id;
    openingReviews.add(id);
    try {
      await run("Loading output preview", async () => {
        if (!client || !selectionTask) return;
        const task = selectionTask;
        const page = await client.request<Page<Preparation["items"][number]>>(
          `/v2/batches/${task.id}/items`,
        );
        const destination = await client.request<Destination>(
          `/v2/destinations/${task.request.destination_id}`,
        );
        if (selectionTask?.id !== task.id) return;
        preparation = {
          id: task.id,
          expires_at: task.expires_at!,
          destination,
          items: page.items,
          total: task.total,
          next_cursor: page.next_cursor,
          outcomes: task.outcomes,
        };
        selectionTask = null;
        readyNotices = readyNotices.filter((notice) => notice.id !== id);
      });
    } finally {
      openingReviews.delete(id);
    }
  }
  async function confirmDownload() {
    await run("Adding downloads", async () => {
      if (!client || !preparation) return;
      const submitted = await client.request<Submission>("/v2/jobs", {
        method: "POST",
        key: preparation.id,
        body: { preparation_id: preparation.id },
      });
      const group = await client.request<JobGroup>(
        `/v2/groups/${submitted.group_id}`,
      );
      preparation = null;
      downloadNotice = { group, ...submissionCounts(submitted) };
      await Promise.all([
        refresh("jobs"),
        refresh("groups"),
        refresh("selections"),
      ]);
    });
  }
  // Cancelling discards partial progress, so it is confirmed first.
  let cancelConfirm = $state<{ count: number; resolve: (confirmed: boolean) => void } | null>(null);
  function confirmCancel(count: number) {
    cancelConfirm?.resolve(false);
    return new Promise<boolean>((resolve) => (cancelConfirm = { count, resolve }));
  }
  function settleCancel(confirmed: boolean) {
    const pending = cancelConfirm;
    cancelConfirm = null;
    pending?.resolve(confirmed);
  }
  async function jobAction(job: Job, action: string) {
    if (action === "cancel" && !(await confirmCancel(1))) return;
    await run("Updating download", async () => {
      await client?.request(`/v2/jobs/${job.id}/${action}`, { method: "POST" });
      await refresh("jobs");
    });
  }
  function editSubscription(sub: Subscription) {
    editingSubscription = sub;
    subscriptionDraft = structuredClone($state.snapshot(sub.request));
    editLanguages = sub.request.policy.languages?.join(", ") ?? "";
    editGroups = sub.request.policy.groups?.join(", ") ?? "";
    editSubtitles = sub.request.policy.subtitle_languages?.join(", ") ?? "";
  }
  async function saveSubscription() {
    await run("Saving subscription", async () => {
      if (!client || !editingSubscription || !subscriptionDraft) return;
      const values = (input: string) => [
        ...new Set(
          input
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ];
      const request = {
        ...subscriptionDraft,
        policy: subscriptionDraft.recipe === "original_images" ? {languages: [], groups: []} : subscriptionDraft.search ? subscriptionDraft.policy : {
          ...subscriptionDraft.policy,
          languages: isMedia(subscriptionDraft.target.provider)
            ? []
            : values(editLanguages),
          groups: isMedia(subscriptionDraft.target.provider)
            ? []
            : values(editGroups),
          subtitle_languages: values(editSubtitles),
        },
      };
      await client.request(`/v2/subscriptions/${editingSubscription.id}`, {
        method: "PATCH",
        body: request,
      });
      editingSubscription = null;
      subscriptionDraft = null;
      await refresh("subscriptions");
      await refresh("inbox");
    });
  }
  async function addDestination() {
    await run("Saving destination", async () => {
      const saved = await client?.request<Destination>(
        reconnecting
          ? `/v2/destinations/${reconnecting.id}/reconnect`
          : "/v2/destinations",
        {
          method: "POST",
          body: reconnecting
            ? { root: destinationPath }
            : { label: destinationName, root: destinationPath },
        },
      );
      destinationOpen = false;
      reconnecting = null;
      await refresh("destinations");
      if (saved && destinations.some((d) => d.id === saved.id))
        destinationId = saved.id;
    });
  }
  async function savePreferences(next: "import" | "overview" = "import") {
    const firstRun = onboarding;
    await run("Saving preferences", async () => {
      const saved = await client?.request<Preferences>("/v2/settings", {
        method: "PATCH",
        body: {
          background,
          bandwidth_bytes_per_second: Math.round(bandwidthKiB * 1024),
          languages: languageList(preferredLanguages),
          onboarding_complete: true,
        },
      });
      if (saved) applyPreferences(saved, true);
      onboarding = false;
      if (firstRun) await navigate(next === "overview" ? "Overview" : "Sources");
      notice = "Preferences saved.";
    });
    // The main setup action continues straight into the reviewed .omdp import
    // once the preferences are saved.
    if (firstRun && !onboarding && next === "import" && !sources.length && !availablePackages.length)
      await pickPackage();
  }
  async function retryStartupRegistration() {
    await run("Registering background startup", async () => {
      if (!client) return;
      const saved = await client.request<Preferences>("/v2/settings");
      await client.request("/v2/settings", {
        method: "PATCH",
        body: {
          background: saved.background,
          bandwidth_bytes_per_second: saved.bandwidth_bytes_per_second ?? 0,
          languages: saved.languages,
          onboarding_complete: saved.onboarding_complete ?? false,
        },
      });
      await refresh("settings");
      notice = "Startup registration updated.";
    });
  }
  async function reviewSource() {
    await run("Inspecting plugin package", async () => {
      try {
        sourceReview = await client?.request("/v2/sources/install", {
          method: "POST",
          admin: true,
          body: { package_path: packagePath, approve_digest: null },
        });
      } catch (e) {
        throw new Error(`Couldn’t review this plugin package. ${text(e)}`);
      }
    });
  }
  async function installSource() {
    await run("Installing source", async () => {
      if (!client) return;
      const result = await client.request<{
        installed?: boolean;
        review_required?: boolean;
        digest: string;
        manifest: ProviderManifest;
      }>("/v2/sources/install", {
        method: "POST",
        admin: true,
        body: {
          package_path: packagePath,
          approve_digest: sourceReview.digest,
        },
      });
      if (result.review_required) {
        // The file no longer matches the approved digest, so the engine
        // installed nothing. Show the new review for explicit approval.
        sourceReview = result;
        throw new Error(
          "The plugin package changed. Review the updated permissions before approving it.",
        );
      }
      if (!result.installed)
        throw new Error("OMD didn’t confirm the installation. Check Sources, then try again.");
      sourceReview = null;
      await refresh("sources");
      notice = "Source installed.";
    });
  }
  async function subscribeProfile(request: SubscribeRequest) {
    await run("Creating subscription", async () => {
      if (!client) return;
      await client.subscribe(request);
      subscribeOpen = false;
      if (details) await loadItemSubscriptions(details.reference);
      await refresh("subscriptions");
      notice = "Following. New posts will appear in Overview.";
    });
  }
  async function subscribe() {
    await run("Creating subscription", async () => {
      if (!client || !details) return;
      await client.subscribe({
        target: subscriptionTarget(details),
        policy: policy(),
        action: automatic ? "download" : "notify",
        destination_id: destinationId,
        recipe: recipe as "cbz" | "image_folder",
        include_existing: !futureOnly,
        interval_minutes: schedule,
        credential_profile: accountFor(details.reference.provider),
      });
      subscribeOpen = false;
      if (details) await loadItemSubscriptions(details.reference);
      await refresh("subscriptions");
      notice = "Subscription created.";
    });
  }
  async function showReleaseFiles(reference: SourceRef) {
    const id = acquired[sourceKey(reference)]?.latest_job_id;
    if (!client || !id) return;
    await run("Loading download details", async () => {
      const job = await client!.request<Job>(`/v2/jobs/${id}`);
      await showFiles(job);
    });
  }
  async function showFiles(job: Job) {
    fileNotice = "";
    await run("Loading download details", async () => {
      const page = await client!.request<Page<Artifact>>(
        `/v2/jobs/${job.id}/files`,
      );
      files = page.items;
      fileCursor = page.next_cursor;
      filesOpen = job;
    });
  }
  function filePath(job: Job, file: Artifact) {
    return `${destinations.find((destination) => destination.id === job.destination_id)?.root ?? ""}/${file.relative_path}`;
  }
  async function copy(value: string) {
    fileNotice = "";
    await run("Copying path", async () => {
      await navigator.clipboard.writeText(value);
      fileNotice = "Path copied.";
    });
  }
  function setTheme() {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem("omd.theme");
    } else {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("omd.theme", theme);
    }
  }
  async function pickFolder() {
    const path = await open({
      directory: true,
      multiple: false,
      title: "Choose an OMD destination",
    });
    if (typeof path === "string") destinationPath = path;
  }
  let choosingPackage = false;
  async function pickPackage() {
    // The native picker is modal; ignore repeated activation instead of
    // disabling the focused trigger, so keyboard focus survives a cancel.
    if (choosingPackage || busy) return;
    choosingPackage = true;
    let path: string | string[] | null;
    try {
      path = await open({
        multiple: false,
        title: "Add a plugin file",
        filters: [{ name: "OMD plugin", extensions: ["omdp"] }],
      });
    } catch (e) {
      error = `Couldn’t open the file picker. ${text(e)}`;
      return;
    } finally {
      choosingPackage = false;
    }
    if (typeof path === "string") {
      packagePath = path;
      await reviewSource();
    }
  }
  async function openFile(job: Job, file: Artifact, reveal: boolean) {
    fileNotice = "";
    await run("Opening saved file", () =>
      invoke("v2_open_artifact", {
        jobId: job.id,
        artifactId: file.id,
        reveal,
      }),
    );
  }
  let windowHeading = $state<HTMLElement>();
  function syncTitlebarDragRegions() {
    if (navigator.platform.includes("Mac") && "__TAURI_INTERNALS__" in window) {
      void invoke("v2_set_titlebar_drag_regions", {
        enabled: !!client && !onboarding,
        expanded: !sidebarCollapsed,
        ...titlebarGeometry(windowHeading, document.querySelector(".sidebar-toggle")),
      }).catch((error) =>
        console.warn("Could not update native title-bar regions", error),
      );
    }
  }
  $effect(syncTitlebarDragRegions);
  $effect(()=>{
    const element=windowHeading;if(!element)return;
    const observer=new ResizeObserver(syncTitlebarDragRegions);observer.observe(element);
    window.addEventListener('omd-theme-changed',syncTitlebarDragRegions);
    return ()=>{observer.disconnect();window.removeEventListener('omd-theme-changed',syncTitlebarDragRegions);};
  });
</script>

<svelte:window onresize={() => requestAnimationFrame(syncTitlebarDragRegions)} onfocus={() => requestAnimationFrame(syncTitlebarDragRegions)} />

{#if !client || recovering || starting}
  <main class="v2-connect">
    <div class="startup-content">
      <img class="app-icon" src={appIcon()} alt="" />
      <h1>
        {starting
          ? "Opening OMD"
          : recovering
            ? "Reconnecting"
            : native
              ? "OMD couldn’t start"
              : "Connect to OMD"}
      </h1>
      {#if starting || recovering}<p role="status">
          {recovering ? "Restoring your session…" : "Getting things ready…"}
        </p>
        <progress aria-label="Opening OMD"></progress>
      {:else if native}
        {#if connectionFailure}<p role="alert">{connectionFailure.summary}</p>{/if}
        {#if connectionFailure?.newerVersion || connectionFailure?.retryable !== false}<div class="startup-actions">
            {#if connectionFailure?.newerVersion}<Button
                variant="primary"
                onclick={() =>
                  openProjectLink(projectLinks.latestRelease).catch(
                    (e) => (detailsNotice = `Couldn’t open the page. ${text(e)}`),
                  )}>Get the latest OMD</Button
              >{/if}
            {#if connectionFailure?.retryable !== false}<Button
                type="submit"
                variant="primary"
                onclick={startNative}>Try again</Button
              >{/if}
          </div>{/if}
        {#if connectionFailure && (connectionFailure.detail || connectionFailure.log)}<details class="startup-details">
            <summary>Technical details</summary>
            {#if connectionFailure.detail}<pre class="connection-detail">{connectionFailure.detail}</pre>{/if}
            <div class="startup-actions">
              <Button onclick={copyStartupDetails}>Copy details</Button>
              {#if connectionFailure.log}<Button onclick={revealStartupLog}>Show log file</Button>{/if}
            </div>
          </details>{/if}
        {#if detailsNotice}<p class="startup-notice" role="status">{detailsNotice}</p>{/if}
      {:else}
        <p>Try reconnecting to continue your downloads and subscriptions.</p>
        {#if connectionFailure}<p role="alert">{connectionFailure.summary}</p>{/if}
        <!-- Browser preview only: attach to a separately started development service. -->
        <details class="startup-details" open>
          <summary>Technical details</summary>
          {#if connectionFailure?.detail}<pre class="connection-detail">{connectionFailure.detail}</pre>{/if}
          <Field label="Engine address"
            ><input
              bind:value={endpoint}
              placeholder="http://127.0.0.1:9000"
            /></Field
          ><Field label="Client token"
            ><input
              type="password"
              bind:value={token}
              autocomplete="off"
            /></Field
          ><Button
            type="submit"
            variant="primary"
            onclick={() =>
              connect({ endpoint, token }).catch((e) => {
                client = null;
                connectionFailure = startupFailure(e);
              })}>Connect</Button
          >
        </details>
      {/if}
    </div>
  </main>
{:else}
  <div
    class="v2-shell"
    class:setup-mode={onboarding}
    class:collapsed={sidebarCollapsed}
    class:mac={navigator.platform.includes("Mac")}
  >
    <div class="v2-titlebar" data-tauri-drag-region="deep">
      {#if !onboarding}<Button
          type="submit"
          class="sidebar-toggle"
          data-tauri-drag-region="false"
          variant="ghost"
          icon
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          aria-controls="main-navigation"
          onclick={() => {
            sidebarCollapsed = !sidebarCollapsed;
            localStorage.setItem(
              "omd.sidebar-collapsed",
              String(sidebarCollapsed),
            );
          }}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          ><PanelLeft size={19} strokeWidth={1.7} /></Button
        >{/if}<span bind:this={windowHeading} class="window-heading"
        >{#if !onboarding}{#if view === "Search" && details}<BackButton
              onclick={closeCollection}
              label={itemTrail.length
                ? `Back to ${itemTrail.at(-1)!.collection.title}`
                : collectionReturn === "Search"
                  ? searchState.editing
                    ? searchState.query.trim() ? "Back to search" : "Back to Explore"
                    : "Back to results"
                  : `Back to ${collectionReturn.toLowerCase()}`}
            />
          {:else if view === "Search" && !searchState.editing}<BackButton
              onclick={editSearch}>Back to search</BackButton
            >
            <h1>Results</h1>
            <div class="header-gallery-controls">
              {@render galleryControls?.()}
            </div>
            <div class="results-actions">
              {#if Object.keys(savedSearchInputs).length && (searchState.results.length || !Object.keys(searchState.issues).length)}
                <Button disabled={!!busy} onclick={() => {
                  if (searchIsSubscribed) {
                    if (currentSearchSubscriptions.length === 1) editSubscription(currentSearchSubscriptions[0]);
                    else void navigate("Subscriptions");
                  } else searchSubscribeOpen = true;
                }}><Rss size={16} />{searchIsSubscribed ? "Subscribed" : "Subscribe"}</Button>
              {/if}
              <LayoutPicker bind:value={searchState.layout} />
            </div>
          {:else}
            <PageHeading
              title={view === "History"
                ? (historyTitle ?? "Downloads")
                : view === "Subscriptions"
                  ? (subscriptionTitle ?? "Subscriptions")
                  : view === "Sources"
                    ? (sourceTitle ?? "Sources")
                    : view === "Downloads" && activeGroup
                      ? activeGroup.title
                      : view === "Search" ? "Explore" : view}
              backLabel={view === "History"
                ? "All history"
                : view === "Subscriptions"
                  ? "All subscriptions"
                  : view === "Sources"
                    ? "All sources"
                    : "All downloads"}
              onback={view === "History" && historyTitle
                ? historyBack
                : view === "Subscriptions" && subscriptionTitle
                  ? subscriptionBack
                  : view === "Sources" && sourceTitle
                    ? sourceBack
                    : view === "Downloads" && activeGroup
                      ? () => {
                          leaveGroup();
                        }
                      : undefined}
            />
          {/if}{#if view === "Sources" && !sourceTitle && sources.length}<div class="page-heading-action"><Button variant="primary" disabled={!!busy} onclick={() => void pickPackage()}><Plus size={17} />Add a plugin file…</Button></div>{/if}{/if}</span
      >
    </div>
    {#if !onboarding && !sidebarCollapsed}<aside
        class="v2-sidebar"
        id="main-navigation"
      >
        <nav aria-label="Main navigation">
          {#each views as item}<Button
              type="submit"
              class={view === item.name ||
              (view === "History" && item.name === "Downloads")
                ? "active"
                : ""}
              variant="ghost"
              aria-label={item.name === "Search" ? "Explore" : item.name}
              title={item.name === "Search" ? "Explore" : item.name}
              onclick={() => navigate(item.name)}
              aria-current={view === item.name ||
              (view === "History" && item.name === "Downloads")
                ? "page"
                : undefined}
              ><item.icon size={19} /><span>{item.name === "Search" ? "Explore" : item.name}</span
              >{#if item.name === "Downloads" && summary.active_jobs}<b
                  >{summary.active_jobs}</b
                >{/if}</Button
            >{/each}
        </nav>
      </aside>{/if}
    <main class="v2-main" bind:this={main}>
      {#if error}<div class="v2-alert" role="alert">
          <AlertCircle size={18} /><span>{error}</span><Button
            type="submit"
            onclick={() => (error = "")}
            aria-label="Dismiss error">×</Button
          >
        </div>{/if}

      <PendingStatus active={!!busy} label={`${busy}…`} floating />
      {#if startupIssue && !startupIssueDismissed}<div class="v2-alert" role="alert">
          <AlertCircle size={18} /><span>{startupIssue.message}</span><Button
            type="submit"
            disabled={!!busy}
            onclick={retryStartupRegistration}
            >Try again</Button
          ><Button
            variant="ghost"
            icon
            aria-label="Dismiss for now"
            title="Dismiss for now"
            onclick={() => (startupIssueDismissed = true)}><X size={16} /></Button
          >
        </div>{/if}
      {#if sourceUpdates.length && (view === "Search" || view === "Sources")}<section
          class="source-update-banner"
          aria-label="Source updates"
        >
          <div>
            <strong>Source updates available</strong>
            <p>Update to use the latest search, discovery, and item details.</p>
          </div>
          <div>
            {#each sourceUpdates as update}<Button
                type="submit"
                onclick={() => {
                  packagePath = update.path;
                  void reviewSource();
                }}>Update {update.name}</Button
              >{/each}
          </div>
        </section>{/if}
      {#if onboarding}<section
          class="v2-onboarding"
          aria-labelledby="setup-title"
        >
          <header class="setup-header">
            <img class="app-icon" src={appIcon()} alt="" />
            <h1 id="setup-title">Set up OMD</h1>
          </header>
          <section class="form-section" aria-labelledby="setup-sources-heading">
            <h2 id="setup-sources-heading">Source plugins</h2>
            <div class="form-box prerequisite-row">
              <span class="symbol-tile" aria-hidden="true"><Blocks size={18} /></span>
              <div>
                <p class="prerequisite-lead">{sourcePrerequisite}</p>
                <p>
                  A plugin is a file (.omdp) that lets OMD search and download
                  from a site. Before it’s installed, you review what it can
                  connect to.
                </p>
                <ProjectLink href={projectLinks.plugins} label="About plugins" onerror={(m) => (error = m)} />
              </div>
            </div>
          </section>
          <section class="form-section" aria-labelledby="setup-downloads-heading">
            <h2 id="setup-downloads-heading">Downloads</h2>
            <div class="form-box">
              <div class="form-row">
                <div class="form-row-label">
                  <span>Save files to</span>
                  {#if destinations.length}<span class="setup-destination"
                    ><Folder size={14} aria-hidden="true" /><span
                      >{destinations.find((d) => d.id === destinationId)?.root ??
                        "Choose a folder"}</span
                    ></span
                  >{:else if !error}<span class="setup-destination pending" role="status"
                    ><LoaderCircle size={14} aria-hidden="true" class="spin" /><span
                      >{navigator.platform.includes("Mac")
                        ? "Waiting for permission to use your Downloads folder… Check for a macOS prompt, or choose another folder."
                        : "Preparing your Downloads folder… You can also choose another folder."}</span
                    ></span
                  >{:else}<span class="setup-destination"
                    ><Folder size={14} aria-hidden="true" /><span>Choose a folder</span></span
                  >{/if}
                </div>
                <div class="form-row-control">
                  <Button
                    type="submit"
                    onclick={() => {
                      reconnecting = null;
                      destinationName = "Downloads";
                      destinationPath = "";
                      destinationOpen = true;
                    }}>Change</Button
                  >
                </div>
              </div>
              <div class="form-row wide picker-row">
                <LanguagePicker bind:value={preferredLanguages} />
              </div>
              <div class="form-row wide">
                <label class="v2-check"
                  ><input type="checkbox" bind:checked={background} />Continue
                  downloads and check subscriptions after closing OMD</label
                >
              </div>
            </div>
          </section>
          <div class="setup-actions">
            <Button
              disabled={!destinations.length || !!busy}
              onclick={() => savePreferences("overview")}
              >Continue without a plugin</Button
            >
            <Button
              type="submit"
              variant="primary"
              disabled={!destinations.length || !!busy}
              onclick={() => savePreferences("import")}
              >{availablePackages.length ? "Review included plugins" : "Add a plugin file…"}</Button
            >
          </div>
        </section>{/if}
      {#if !onboarding}
        <div hidden={view !== "Search" || !!details}>
          <Discovery
            bind:this={discoveryPage}
            oncontrols={(controls) => (galleryControls = controls)}
            {client}
            {sources}
            {destinations}
            onimagedownload={prepareImages}
            state={searchState}
            enabled={view === "Search" && !details}
            accounts={accountProfiles}
            languages={preferredLanguages}
            {accountRevision}
            oncollection={openCollection}
            onlink={(value) => {
              url = value;
              void openUrl();
            }}
            onsources={() => navigate("Sources")}
            empty={pluginPrerequisite}
          />
        </div>
        {#if details}
          {#key sourceKey(details.reference)}
            <div hidden={view !== "Search"}>
              <CollectionInfo
                bind:this={collectionInfo}
                initialState={initialCollectionInfo}
                {client}
                collection={details}
                {destinations}
                onimagedownload={prepareImages}
                ontagsearch={(provider,tag)=>{itemTrail=[];closeCollection();view='Search';discoveryPage?.searchTags(provider,[tag]);}}
                languages={preferredLanguages}
                manifest={sources.find(
                  (s) => s.manifest.id === details?.reference.provider,
                )?.manifest}
                account={accountFor(details.reference.provider)}
                oncollection={openCollection}
                onsection={(collection)=>{initialCollectionInfo=undefined;void openCollection(collection,false,undefined,true);}}
                onlanguages={receivedLanguages}
              >
                {#snippet heading()}
                  <header class="collection-title">
                    <div class="v2-grow">
                      <span class="v2-source-name"
                        >{sources.find(
                          (source) =>
                            source.manifest.id === details!.reference.provider,
                        )?.manifest.name}</span
                      >
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Full title tooltip on keyboard focus) -->
                      <h1 tabindex="0" use:truncatedTitle={details!.title}>
                        {details!.title}
                      </h1>
                      {#if acquiredError}<p role="status">
                          {acquiredError}
                        </p>{/if}
                    </div>
                  </header>
                {/snippet}
                {#snippet actions()}
                  <div class="identity-actions">
                    {#if details?.summary?.image}<Button variant="primary" onclick={()=>imageDetailDownload=[details!]}><Download size={16}/>Download {details.summary.image.count>1?'post':'image'}</Button>{/if}
                    {#if itemSubscriptions.length}<ActionMenu
                        text
                        label="Subscribed"
                        disabled={!!busy}
                      >
                        {#snippet children(choose)}
                          {#each itemSubscriptions as subscription}
                            <Button
                              variant="ghost"
                              onclick={() =>
                                choose(() => editSubscription(subscription))}
                              >Subscription settings</Button
                            >
                            <Button
                              variant="ghost"
                              onclick={() =>
                                choose(() => {
                                  void run(
                                    "Updating subscription",
                                    async () => {
                                      await client!.request(
                                        `/v2/subscriptions/${subscription.id}/${subscription.enabled ? "pause" : "resume"}`,
                                        { method: "POST" },
                                      );
                                      await Promise.all([
                                        refresh("subscriptions"),
                                        loadItemSubscriptions(
                                          details!.reference,
                                        ),
                                      ]);
                                    },
                                  );
                                })}
                              >{subscription.enabled
                                ? "Pause updates"
                                : "Resume updates"}</Button
                            >
                          {/each}
                          <hr />
                          <Button
                            variant="danger"
                            onclick={() =>
                              choose(() => {
                                unsubscribeConfirm = true;
                              })}>Unsubscribe…</Button
                          >
                        {/snippet}
                      </ActionMenu>{:else if canSubscribe(details!)}<Button
                        onclick={() => (subscribeOpen = true)}
                        ><Rss size={16} />{subscriptionLabel(details!)}</Button
                      >{/if}
                    <Button
                      variant="ghost"
                      icon
                      title="Edit metadata"
                      aria-label="Edit metadata"
                      onclick={() =>
                        presentation?.edit("collection", details!.reference, {
                          title: details!.title,
                          description: details!.description,
                        })}><Pencil size={16} /></Button
                    >
                    {#if details!.canonical_url}<Button
                        variant="ghost"
                        icon
                        title="View on source"
                        aria-label="View on source"
                        onclick={externalItem}
                        ><ExternalLink size={16} /></Button
                      >{/if}
                  </div>
                {/snippet}
                {#snippet children()}
                  {#if audioSource && details?.kind === "item"}{@const release=releases[0]}
                  <section class="episode-download" aria-label="Download episode">
                    {#if !itemUnavailable}<div class="output-preferences"><SelectPicker label="Destination" bind:value={destinationId} options={destinations.map(d=>({id:d.id,label:d.label}))}/><OutputOptions audio media bind:recipe bind:maxHeight bind:subtitles bind:automaticSubtitles/></div>{/if}
                    <PendingStatus active={loadingReleases} label="Loading episode…"/>
                      <div class="episode-download-action"><span>{[details.summary?.published_label ? date(details.summary.published_label) : "", details.summary?.duration_seconds != null ? durationLabel(details.summary.duration_seconds) : ""].filter(Boolean).join(" · ")}</span>
                      {#if activeReleases.has(sourceKey(details.reference))}<Button onclick={()=>navigate("Downloads")}>View in Downloads</Button>
                      {:else}<Button variant="primary" disabled={!!busy || !destinationId || loadingReleases || (release && release.availability!=="available")} onclick={()=>run("Preparing episode",()=>prepareReferences([details!.reference]))}><Download size={16}/>Download episode</Button>{/if}</div>
                      {#if release?.unavailable_reason}<p>{release.unavailable_reason}</p>{/if}
                  </section>
                  {:else if !details?.summary?.image}
                  <div id="release-filters" tabindex="-1" class="v2-toolbar release-toolbar" class:media-filters={mediaSource}>
                    {#if !mediaSource && hasAccounts(details!.reference.provider)}<AccountPicker
                        client={client!}
                        provider={details!.reference.provider}
                        bind:value={
                          accountProfiles[details!.reference.provider]
                        }
                        revision={accountRevision}
                        disabled={!!busy}
                        onchange={() => {
                          selected = new Set();
                          void loadReleases(false);
                        }}
                      />{/if}
                    {#if !mediaSource}<SelectPicker
                        label="Language"
                        bind:value={language}
                        disabled={!collectionLanguages.length}
                        options={collectionLanguages.length
                          ? [
                              { id: "", label: "All languages" },
                              ...releaseLanguages,
                            ]
                          : [
                              {
                                id: language,
                                label: languagesLoaded
                                  ? "No translated chapters"
                                  : "Loading…",
                              },
                            ]}
                        onchange={() => {
                          selected = new Set();
                          void loadReleases(false);
                        }}
                      /><SelectPicker
                        label="Chapter order"
                        bind:value={releaseOrder}
                        onchange={() => {
                          void loadReleases(false);
                        }}
                        options={[
                          { id: "asc", label: "Ascending" },
                          { id: "desc", label: "Descending" },
                        ]}
                      />{#if groups.length > 1 || group}<SelectPicker
                        label="Translator / group"
                        bind:value={group}
                        onchange={clearSelection}
                        options={[
                          { id: "", label: "All groups" },
                          ...groups.map((name) => ({
                            id: name ?? "",
                            label: name ?? "Unknown group",
                          })),
                        ]}
                      />{/if}{/if}
                  </div>
                  {#if audioSource}<div class="episode-list-heading"><h2>Episodes</h2><SelectPicker label="Order" bind:value={releaseOrder} options={[{id:"desc",label:"Newest first"},{id:"asc",label:"Oldest first"}]} onchange={()=>void loadReleases(false)}/></div>{/if}
                  {#if !itemUnavailable || (mediaSource && hasAccounts(details!.reference.provider))}<svelte:element this={audioSource ? "details" : "div"} class="download-settings" class:audio-download-settings={audioSource}>
                    {#if audioSource}<summary>Download options</summary>{/if}
                  <div class="acquisition-toolbar" class:audio-options={audioSource}>
                    <div class="output-preferences">
                    {#if mediaSource && hasAccounts(details!.reference.provider)}<AccountPicker
                        client={client!}
                        provider={details!.reference.provider}
                        bind:value={
                          accountProfiles[details!.reference.provider]
                        }
                        revision={accountRevision}
                        disabled={!!busy}
                        onchange={() => {
                          selected = new Set();
                          void loadReleases(false);
                        }}
                      />{/if}

                      {#if !itemUnavailable}<SelectPicker
                        label="Destination"
                        bind:value={destinationId}
                        options={destinations.map((destination) => ({
                          id: destination.id,
                          label: destination.label,
                        }))}
                      /><OutputOptions
                        audio={audioSource}
                        media={mediaSource}
                        bind:recipe
                        bind:maxHeight
                        bind:subtitles
                        bind:automaticSubtitles
                      />{/if}
                    </div>
                  </div>
                  </svelte:element>{/if}
                  <div
                    id="release-selection"
                    tabindex="-1"
                    class="release-selection-toolbar"
                    class:media-selection={mediaSource && details!.kind !== "item"}
                    aria-label="Release selection"
                  >
                    <ActionMenu
                      text
                      label="Select"
                      disabled={loadingReleases ||
                        selecting ||
                        queueingSelection}
                    >
                      {#snippet children(choose)}
                        <Button
                          onclick={() => choose(() => void selectBulk("all"))}
                          >All available</Button
                        >
                        <Button
                          onclick={() =>
                            choose(() => void selectBulk("not_downloaded"))}
                          >Not downloaded</Button
                        >
                        <Button
                          onclick={() =>
                            choose(() => void selectBulk("missing_files"))}
                          >Not downloaded + missing files</Button
                        >
                        {/snippet}
                    </ActionMenu>
                    <label class="v2-check unavailable-toggle"
                      ><input
                        type="checkbox"
                        bind:checked={showUnavailable}
                      />Show unavailable</label
                    >
                    <span class="selection-count"
                      >{selected.size} selected{selected.size && !mediaSource
                        ? " across matching releases"
                        : ""}</span
                    >
                    {#if selected.size || selecting}<Button
                        variant="ghost"
                        disabled={queueingSelection}
                        onclick={clearSelection}>Clear selection</Button
                      >{/if}
                  {#if mediaSource && details!.kind !== "item" && !audioSource}
                    <div class="release-layout-toolbar">
                      <Button variant="ghost" icon title="Table view" aria-label="Table view" aria-pressed={releaseTable} onclick={()=>releaseTable=true}><Table2 size={16}/></Button>
                      <LayoutPicker inactive={releaseTable} bind:value={releaseLayout} storageKey="omd.channel-video-layout" onchange={()=>releaseTable=false}/>
                    </div>
                  {/if}
                    <Button
                      variant="primary"
                      disabled={!!busy ||
                        selecting ||
                        loadingReleases ||
                        !selected.size ||
                        !destinationId ||
                        queueingSelection ||
                        currentCheck?.state === "working" ||
                        startingCurrentCheck}
                      onclick={prepareSelected}
                      ><Download size={17} />{queueingSelection ||
                      startingCurrentCheck
                        ? "Starting downloads…"
                        : selected.size
                          ? `Download ${selected.size} selected`
                          : "Download selected"}</Button
                    >
                  </div>
                  <PendingStatus active={selecting} label={selectionProgress} />
                  {#if selectionError}<p role="alert">{selectionError}</p>{/if}
                  {#if !selecting && !selected.size && selectionProgress === "No releases match this selection."}<p
                      role="status"
                    >
                      {selectionProgress}
                    </p>{/if}
                  {#if mediaSource && details!.kind !== "item" && !releaseTable}
                    <ResultBrowser client={client!} items={filtered.map(releaseCollection)} layout={releaseLayout} bind:active={releaseActive} loading={loadingReleases} artwork={filtered.length && filtered.every(r=>r.preview?.summary?.artwork_layout === "portrait")?"portrait":"landscape"} sources={{[details!.reference.provider]:sources.find(s=>s.manifest.id===details!.reference.provider)?.manifest.name??""}} manifests={Object.fromEntries(sources.map(s=>[s.manifest.id,s.manifest]))} accounts={accountProfiles} oncollection={openCollection}>
                      {#snippet selection(item)}
                        {@const release=filtered.find(r=>r.reference.id===item.reference.id)!}
                        <div class="video-selection">
                          {#if release.availability === "available" && !activeReleases.has(sourceKey(release.reference))}
                            <label class="v2-check"><input type="checkbox" aria-label={`Select ${release.title}`} checked={selected.has(release.reference.id)} disabled={selecting||queueingSelection} onchange={(event)=>select(release.reference.id,event.currentTarget.checked)}/>Select</label>
                          {:else}<span>{activeReleases.has(sourceKey(release.reference))?"In Downloads":release.unavailable_reason??"Unavailable"}</span>{/if}
                          {#if acquired[sourceKey(release.reference)]?.acquired_versions}<Button variant="ghost" onclick={()=>showReleaseFiles(release.reference)}><Folder size={14}/>Downloaded</Button>{/if}
                        </div>
                      {/snippet}
                    </ResultBrowser>
                  {:else}
                  <div
                    class="v2-table-wrap release-table"
                    class:media-table={mediaSource}
                    class:ui-enter={!loadingReleases}
                    aria-busy={loadingReleases}
                  >
                    <table>
                      <colgroup
                        ><col style="width:48px" /><col /><col
                          style="width:22%"
                        /><col style="width:14%" /><col
                          style="width:18%"
                        /></colgroup
                      >
                      <thead
                        ><tr
                          ><th
                            ><input
                              type="checkbox"
                              aria-label="Select all available releases"
                              checked={allSelected}
                              indeterminate={selected.size > 0 && !allSelected}
                              disabled={loadingReleases ||
                                selecting ||
                                queueingSelection ||
                                (!selectableReleases.length && !releaseCursor)}
                              onchange={(event) =>
                                event.currentTarget.checked
                                  ? void selectBulk("all")
                                  : clearSelection()}
                            /></th
                          ><th>Release</th><th
                            >{mediaSource
                              ? "Published"
                              : "Language / group"}</th
                          ><th>Availability</th><th>Download history</th></tr
                        ></thead
                      ><tbody>
                        {#if loadingReleases && !filtered.length}
                          <tr class="release-loading"
                            ><td colspan="5"
                              ><div
                                role="status"
                                aria-label="Loading releases"
                                class="release-skeleton"
                              >
                                <span class="sr-only">Loading releases…</span
                                >{#each [1, 2, 3]}<div
                                    aria-hidden="true"
                                  >
                                    <span></span><span></span><span></span>
                                  </div>{/each}
                              </div></td
                            ></tr
                          >
                        {/if}{#each filtered as release}<tr
                            ><td
                              >{#if release.availability === "available" && !activeReleases.has(sourceKey(release.reference))}<input
                                  type="checkbox"
                                  aria-label={`Select ${release.title}`}
                                  disabled={loadingReleases ||
                                    release.availability !== "available" ||
                                    selecting ||
                                    queueingSelection ||
                                    activeReleases.has(
                                      sourceKey(release.reference),
                                    )}
                                  checked={selected.has(release.reference.id)}
                                  onchange={(event) =>
                                    select(
                                      release.reference.id,
                                      event.currentTarget.checked,
                                    )}
                                />{/if}</td
                            ><td
                              ><div class="v2-release-name">
                                {#if mediaSource}
                                  {#if release.preview?.artwork_url}<div class="release-thumbnail"><Artwork {client} provider={release.reference.provider} url={release.preview.artwork_url} label={release.title}/></div>{/if}
                                  <button class="release-title-link" onclick={()=>openCollection(releaseCollection(release))}>{release.title}</button>
                                {:else}<strong>{release.title}</strong>{/if}<Button
                                  type="submit"
                                  class="v2-release-edit"
                                  variant="ghost"
                                  icon
                                  title={`Edit metadata for ${release.title}`}
                                  aria-label={`Edit metadata for ${release.title}`}
                                  onclick={() =>
                                    presentation?.edit(
                                      "release",
                                      release.reference,
                                      {
                                        title: release.title,
                                        chapter: release.chapter,
                                        volume: release.volume,
                                      },
                                    )}><Pencil size={14} /></Button
                                >
                              </div>
                              {#if mediaSource && release.preview?.summary}<small class="release-facts">
                                {#if release.preview.summary.duration_seconds != null}<span>{durationLabel(release.preview.summary.duration_seconds)}</span>{/if}
                                {#if release.preview.summary.view_count != null}<span>{Intl.NumberFormat(appLocale(),{notation:"compact"}).format(release.preview.summary.view_count)} views</span>{/if}
                              </small>{/if}
                              {#if !mediaSource && release.chapter && !release.title
                                  .toLowerCase()
                                  .startsWith(`chapter ${release.chapter}`.toLowerCase())}<small
                                  >Chapter {release.chapter}</small
                                >{/if}</td
                            ><td
                              >{mediaSource
                                ? release.published_at ? date(release.published_at) : release.preview?.summary?.published_label ?? "—"
                                : languageName(release.language ?? "") ||
                                  "Unspecified"}<small
                                >{mediaSource
                                  ? ""
                                  : (release.group ?? "No group listed")}</small
                              ></td
                            ><td
                              ><span class="v2-badge"
                                >{release.availability === "unknown"
                                  ? "Availability unknown"
                                  : release.availability.replaceAll(
                                      "_",
                                      " ",
                                    )}</span
                              >{#if release.availability === "external" && release.canonical_url}<Button
                                  variant="ghost"
                                  onclick={() =>
                                    run("Opening source", () =>
                                      invoke("v2_open_source", {
                                        url: release.canonical_url,
                                      }),
                                    )}
                                  ><ExternalLink size={14} />View on source</Button
                                >{/if}
                              {#if release.unavailable_reason}<small
                                  >{release.unavailable_reason}</small
                                >{/if}</td
                            ><td class="release-status"
                              >{#if activeReleases.has(sourceKey(release.reference))}<span
                                  >In Downloads</span
                                >{:else if acquired[sourceKey(release.reference)]?.acquired_versions}{@const status =
                                  acquired[sourceKey(release.reference)]}<Button
                                  variant="ghost"
                                  onclick={() =>
                                    showReleaseFiles(release.reference)}
                                  ><Folder size={15} />{usableLocalFiles(status)
                                    ? "Open files"
                                    : (fileStatusLabels[
                                        status.file_state ?? ""
                                      ] ?? "Downloaded before")}</Button
                                >{:else}<span class="status-empty"
                                  >{acquiredLoading
                                    ? "Checking…"
                                    : acquiredError
                                      ? "Unavailable"
                                      : "Not downloaded"}</span
                                >{/if}</td
                            ></tr
                          >{/each}</tbody
                      >
                    </table>
                  </div>
                  {/if}
                  {#if !filtered.length && !loadingReleases && !releaseCursor && !error && busy !== "Resolving link"}
                    <EmptyState
                      compact
                      level={3}
                      title={showUnavailable
                        ? "No matching releases"
                        : `No downloadable ${mediaSource ? "items" : "chapters"} match these filters`}
                      description={showUnavailable
                        ? "Try another language or release group."
                        : undefined}
                    >
                      {#if !showUnavailable}<Button
                          onclick={() => (showUnavailable = true)}
                          >Show unavailable</Button
                        >{/if}
                    </EmptyState>
                  {/if}<InfiniteMore
                    cursor={releaseCursor}
                    disabled={loadingReleases || !!busy}
                    load={() => loadReleases(true)}
                    label="releases"
                  />
                  {/if}
                {/snippet}</CollectionInfo
              >
            </div>
          {/key}
        {/if}
        {#if view !== "Search"}
          {#if view === "Overview"}
            <div class="page-summary">
            {#if !sources.length}{@render pluginPrerequisite()}{/if}
            <!-- Counts are shown once there is something to count; download
                 history stays reachable after the last source is removed. -->
            {#if sources.length || summary.active_jobs || summary.acquired || summary.following || summary.attention}<div class="v2-stats">
              <StatCard
                label="Active downloads"
                value={summary.active_jobs}
                onclick={() => navigate("Downloads")}
              />
              <StatCard
                label="Subscriptions"
                value={summary.following}
                onclick={() => navigate("Subscriptions")}
              />
              <StatCard
                label="Downloaded items"
                value={summary.acquired}
                onclick={() => navigate("History")}
              />
            </div>{/if}
            {#if summary.attention}<div class="v2-alert">
                <AlertCircle size={18} /><span
                  >{summary.attention}
                  {summary.attention === 1
                    ? "download needs"
                    : "downloads need"} attention.</span
                ><Button
                  type="submit"
                  onclick={async () => {
                    await navigate("Downloads");
                    downloadAttention = true;
                  }}>Review downloads</Button
                >
              </div>{/if}
            {#if sources.length && !summary.acquired && !summary.active_jobs && !summary.following}<section
                class="overview-start"
                aria-labelledby="start-download-heading"
              >
                <span class="symbol-tile" aria-hidden="true"><Search size={18} /></span>
                <div>
                  <h2 id="start-download-heading">Start a download</h2>
                  <p>Search your sources or paste a link, then choose what to save.</p>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  onclick={() => navigate("Search")}>Open Search</Button
                >
              </section>{/if}
            {#if sources.length || inbox.length || summary.following}<section
              class="form-section"
              aria-labelledby="new-releases-heading"
            >
              <h2 id="new-releases-heading">New releases</h2>
              <div class="form-box inbox-list">
              {#each inbox as item}<div class="inbox-row"><div class="inbox-copy">
                    {#if item.release.preview}<button class="release-title-link" onclick={()=>openCollection(item.release.preview)}>{item.release.title}</button>{:else}<strong>{item.release.title}</strong>{/if}<small
                       title={formatTime(item.created_at)}>Found {publishedAge(item.created_at)}{item.read_at ? " · Read" : ""}{item.state === "failed" ? " · Download failed" : item.state === "pending" || item.state === "running" ? " · Download queued" : ""}</small
                    >
                    {#if item.issue}<p>{item.issue.message}</p>{/if}
                    </div><div class="inbox-actions">{#if !item.read_at}<Button
                        type="submit"
                        disabled={!!busy}
                        onclick={() =>
                          run("Marking release as read", async () => {
                            await client!.request(`/v2/inbox/${item.id}/read`, {
                              method: "POST",
                            });
                            await refresh("inbox");
                          })}>Mark as read</Button
                      >{/if}
                    {#if item.state === "failed" && needsAnotherFormat(item.issue) && inboxSubscription(item)}<Button
                        type="submit"
                        disabled={!!busy}
                        onclick={() => chooseInboxFormat(item, inboxSubscription(item)!)}
                        >Choose another format</Button
                      >{:else if item.state === "failed"}<Button
                        type="submit"
                        disabled={!!busy}
                        onclick={() =>
                          run("Retrying download", async () => {
                            await client!.request(`/v2/inbox/${item.id}/retry`, {
                              method: "POST",
                            });
                            await refresh("inbox");
                          })}>Retry download</Button
                      >{/if}
                  </div></div>{:else}<EmptyState
                    icon={Rss}
                    level={3}
                    compact
                    title="No new releases yet"
                    description={summary.following
                      ? "New releases from your subscriptions will appear here."
                      : "Subscribe to a title to see new releases here."}
                  />{/each}
              </div>
              <InfiniteMore
                cursor={inboxCursor}
                load={() => moreResource("inbox")}
                label="new releases"
              />
            </section>{/if}
            </div>
          {:else if view === "History" || view === "Downloads"}
            {#if !activeGroup && !historyTitle}<div
                class="downloads-tabs"
                role="group"
                aria-label="Download sections"
              >
                <Button
                  variant="ghost"
                  aria-pressed={view === "Downloads"}
                  onclick={() => {
                    navigate("Downloads");
                  }}>Activity</Button
                >
                <Button
                  variant="ghost"
                  aria-pressed={view === "History"}
                  onclick={() => navigate("History")}>History</Button
                >
              </div>{/if}
            {#if view === "History"}<History
                oncollection={openCollection}
                client={client!}
                revision={fileRevision + acquisitionRevision}
                sources={Object.fromEntries(
                  sources.map((s) => [s.manifest.id, s.manifest.name]),
                )}
                onfocus={(title, back) => {
                  historyTitle = title;
                  historyBack = back;
                }}
                onfiles={showFiles}
                onremove={(jobs, mode) => (removal = { jobs, mode })}
              />
            {:else}
              {#if !activeGroup}
                {#if preparingDownloads.length}<section class="download-check-section" aria-label="Preparing downloads">
                  <h2>Preparing downloads</h2>
                  <DownloadChecks tasks={preparingDownloads} contexts={downloadContexts} {destinations} {isMedia} onchoose={chooseCheckOptions} onaction={checkRowAction} ondismiss={dismissCheck} onrefresh={refreshCheck} />
                </section>{/if}
                {#if attentionChecks.length}<section class="download-check-section" aria-label="Needs attention">
                  <h2>Needs attention</h2>
                  <DownloadChecks tasks={attentionChecks} contexts={downloadContexts} {destinations} {isMedia} onchoose={chooseCheckOptions} onaction={checkRowAction} ondismiss={dismissCheck} onrefresh={refreshCheck} />
                </section>{/if}
                <InfiniteMore cursor={selectionsCursor} load={() => moreResource("selections")} label="download checks" />
              {/if}
              {#if activeGroup || jobGroups.length || jobs.length || !visibleChecks.length}
                <DownloadList
                  onbatch={async (ids, action, grouped) => {
                    if (
                      action === "cancel" &&
                      !(await confirmCancel(
                        grouped
                          ? jobGroups
                              .filter((g) => ids.includes(g.id))
                              .reduce((sum, g) => sum + g.active + g.paused + g.failed, 0)
                          : ids.length,
                      ))
                    )
                      return;
                    await run("Updating downloads", async () => {
                      for (const id of ids) {
                        if (grouped)
                          await client!.request(`/v2/groups/${id}/${action}`, {
                            method: "POST",
                          });
                        else {
                          const job = jobs.find((j) => j.id === id);
                          if (job)
                            await client!.request(
                              `/v2/jobs/${id}/${action === "resume" && job.state !== "paused" ? "retry" : action}`,
                              { method: "POST" },
                            );
                        }
                      }
                      await Promise.all([refresh("jobs"), refresh("groups")]);
                    });
                  }}
                  {jobs}
                  groups={jobGroups}
                  {activeGroup}
                  bind:grouped
                  bind:query={jobQuery}
                  {destinations}
                  busy={!!busy}
                  {jobCursor}
                  groupCursor={groupsCursor}
                  onsearch={() => {
                    appliedJobQuery = jobQuery;
                    void run("Searching downloads", async () => {
                      await Promise.all([refresh("jobs"), refresh("groups")]);
                    });
                  }}
                  ongroup={(group) =>
                    run("Opening downloads", async () => {
                      const page = await client!.request<Page<Job>>(
                        `/v2/groups/${group.id}/jobs?limit=100`,
                      );
                      jobQuery = appliedJobQuery = "";
                      jobs = page.items;
                      jobCursor = page.next_cursor;
                      activeGroup = group;
                      await restoreScroll();
                    })}
                  onjobaction={jobAction}
                  onformat={chooseAnotherFormat}
                  ongroupaction={groupAction}
                  onfiles={showFiles}
                  onbrowse={() => navigate("Search")}
                  empty={sources.length ? undefined : pluginPrerequisite}
                  bind:attention={downloadAttention}
                  onmorejobs={moreJobs}
                  onmoregroups={() => moreResource("groups")}
                />{/if}
            {/if}
          {:else if view === "Subscriptions"}
            <SubscriptionsPage
              onfocus={(title, back) => {
                subscriptionTitle = title;
                subscriptionBack = back;
              }}
              client={client!}
              items={subscriptions}
              sources={Object.fromEntries(
                sources.map((s) => [s.manifest.id, s.manifest.name]),
              )}
              onopen={openCollection}
              onsettings={editSubscription}
              onsearch={openSearchSubscription}
              onchange={() => refresh("subscriptions")}
              empty={sources.length ? undefined : pluginPrerequisite}
            />
          {:else if view === "Sources"}
            <div class="page-form">
            <SourcesPage
              onfocus={(title, back) => {
                sourceTitle = title;
                sourceBack = back;
              }}
              {sources}
              busy={!!busy}
              onbrowse={(source) => void browseSource(source.id)}
              onaccounts={(source) => (accountsSource = source)}
              onremove={(id) => sourceRemovals?.inspect(id)}
              empty={pluginFilePrerequisite}
            />
            {#if availablePackages.length && !sourceTitle}<section
                class="source-catalog form-section"
                aria-labelledby="source-catalog-heading"
              >
                <h2 id="source-catalog-heading">Included with OMD</h2>
                <div class="source-catalog-grid">
                  {#each availablePackages as reference}<article>
                      <Blocks size={20} aria-hidden="true" />
                      <div>
                        <h3>{reference.name}</h3>
                        {#if reference.description}<p>
                            {reference.description}
                          </p>{/if}
                      </div>
                      <Button
                        type="submit"
                        aria-label={`Install ${reference.name}`}
                        disabled={!!busy}
                        onclick={() => {
                          packagePath = reference.path;
                          void reviewSource();
                        }}>Install</Button
                      >
                    </article>{/each}
                </div>
              </section>{/if}
            <SourceRemovals
              {client}
              revision={removalRevision}
              bind:this={sourceRemovals}
              onchange={() => refresh("sources")}
            />
            </div>
          {:else if view === "Settings"}
            <div class="page-form">
            <StoragePanel
              {client}
              {destinations}
              {native}
              revision={storageRevision}
              onadd={() => {
                reconnecting = null;
                destinationName = "";
                destinationPath = "";
                destinationOpen = true;
              }}
              onreconnect={(destination) => {
                reconnecting = destination;
                destinationName = destination.label;
                destinationPath = destination.root;
                destinationOpen = true;
              }}
              onchange={() => refresh("destinations")}
            />
            {#if preferenceConflict}<p class="v2-alert" role="alert">Settings changed in another window. Saving applies your current choices.</p>{/if}
            <section class="form-section" aria-labelledby="settings-downloads-heading">
              <h2 id="settings-downloads-heading">Downloads</h2>
              <div class="form-box">
                <div class="form-row">
                  <div class="form-row-label">
                    <label class="v2-check"><input type="checkbox" bind:checked={background}/>Keep running when the window closes</label>
                    <p>Continue downloads and subscription checks after closing the window.</p>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-row-label" for="settings-speed-limit">
                    <span>Download speed limit</span>
                    <small>0 means no limit.</small>
                  </label>
                  <div class="form-row-control">
                    <input id="settings-speed-limit" type="number" min="0" max="1048576" step="1" bind:value={bandwidthKiB} aria-describedby="settings-speed-unit"/>
                    <span class="unit" id="settings-speed-unit">KB/s</span>
                  </div>
                </div>
                
              </div>
            </section>
            <section class="form-section" aria-labelledby="settings-languages-heading">
              <h2 id="settings-languages-heading">Languages</h2>
              <div class="form-box">
                <div class="form-row wide picker-row">
                  <LanguagePicker bind:value={preferredLanguages} label="Preferred languages"/>
                </div>
                <p class="form-note">Search results and chapter selection use these languages.</p>
                
              </div>
            </section>
            <Notifications {client} revision={notificationRevision}/>
            <AppearanceSettings bind:mode={theme} {native} onchange={setTheme}/>
            <CacheSettings/>
            <section class="form-section" aria-labelledby="settings-about-heading">
              <h2 id="settings-about-heading">About OMD</h2>
              <div class="form-box">
                <div class="form-row">
                  <div class="form-row-label"><span>Version</span><small>OMD is free, open-source software.</small></div>
                  <span class="form-row-control about-version">{appVersion ?? "Development build"}</span>
                </div>
                <div class="form-row">
                  <div class="form-row-label"><span>Updates</span><small>OMD doesn’t update itself. New versions are published on the releases page.</small></div>
                  <div class="form-row-control"><ProjectLink href={projectLinks.releases} label="Check for updates" onerror={(m) => (error = m)} /></div>
                </div>
                {#if native}<div class="form-row">
                  <div class="form-row-label"><span>Install an update</span><small>Stops background downloads and quits OMD so you can install the new version. Your settings and downloads are kept.</small></div>
                  <Button disabled={!!busy} onclick={()=>run("Stopping OMD",()=>invoke("v2_prepare_update"))}>Quit to install an update</Button>
                </div>{/if}
                <div class="form-row">
                  <div class="form-row-label"><span>License</span><small>Notices for the open-source components OMD uses come with each release.</small></div>
                  <div class="form-row-control about-links">
                    <ProjectLink href={projectLinks.license} label="License" onerror={(m) => (error = m)} />
                    <ProjectLink href={projectLinks.home} label="Project website" onerror={(m) => (error = m)} />
                  </div>
                </div>
              </div>
            </section>
            {#if preferencesDirty}<div class="settings-save-bar"><span>Unsaved preference changes</span><Button variant="primary" disabled={!!busy} onclick={()=>savePreferences("overview")}>Save changes</Button></div>{/if}
            </div>
          {/if}
        {/if}
        {#if client}<div class="page-form"><PresentationSettings
            bind:this={presentation}
            {client}
            visible={view === "Settings"}
          /><FileOperations
            bind:this={fileOperations}
            {client}
            revision={fileRevision}
            showList={view === "Settings"}
          /></div>{/if}
      {/if}
    </main>
  </div>
{/if}

{#if client && !recovering && !starting}
  {#if preparation}<DownloadReview
      preview={preparation}
      busy={!!busy}
      {error}
      onclose={() => (preparation = null)}
      ondone={() => {
        if (preparation)
          dismissedChecks = [...new Set([...dismissedChecks, preparation.id])];
        preparation = null;
      }}
      onconfirm={confirmDownload}
      onmore={async () => {
        if (!preparation?.next_cursor || !client) return;
        const preview = preparation;
        const page = await client.request<Page<Preparation["items"][number]>>(
          `/v2/batches/${preview.id}/items?cursor=${encodeURIComponent(preview.next_cursor!)}&limit=100`,
        );
        if (preparation?.id === preview.id)
          preparation = {
            ...preparation,
            items: [...preparation.items, ...page.items],
            next_cursor: page.next_cursor,
          };
      }}
    />{/if}

  {#if destinationOpen}<Dialog
      {error}
      title={reconnecting ? "Reconnect destination" : "Add destination"}
      onclose={() => (destinationOpen = false)}
      >{#if reconnecting}<p>
          Choose the same OMD folder at its current location. OMD checks its
          identity before reconnecting it.
        </p>{/if}
      <form
        id="dialog-form-app-58038"
        onsubmit={(event) => {
          event.preventDefault();
          void addDestination();
        }}
      >
        <Field label="Name"
          ><input
            bind:value={destinationName}
            readonly={!!reconnecting}
            placeholder="Downloads"
            required
          /></Field
        ><Field label="Existing folder path"
          ><input
            bind:value={destinationPath}
            placeholder="Choose a folder or enter its full path"
            required
          /></Field
        >{#if native}<Button type="button" onclick={pickFolder}
            >Choose folder</Button
          >{/if}
        <p>
          Downloads are saved here. Existing files in this folder are preserved.
        </p>
      </form>
      {#snippet footer()}
        <Button
          type="submit"
          form="dialog-form-app-58038"
          variant="primary"
          disabled={!!busy}
          >{reconnecting ? "Reconnect" : "Add destination"}</Button
        >
      {/snippet}</Dialog
    >{/if}
  {#if searchSubscribeOpen && client}<SearchSubscriptionDialog
    {client} applied={savedSearchInputs} {sources} schemas={searchState.schemas}
    onclose={()=>searchSubscribeOpen=false}
    oncreated={async()=>{searchSubscribeOpen=false;await refresh("subscriptions");notice="Search subscribed. New matches will appear in Overview.";}}
  />{/if}
  {#if editingSubscription && subscriptionDraft}<Dialog
      {error}
      title="Subscription settings"
      onclose={() => {
        editingSubscription = null;
        subscriptionDraft = null;
      }}
    >
      <form
        id="dialog-form-app-59334"
        onsubmit={(event) => {
          event.preventDefault();
          void saveSubscription();
        }}
      >
        <Field label="Subscription name"><input maxlength="200" value={subscriptionDraft.name ?? ""} placeholder={editingSubscription.title ?? "Use the original name"} oninput={event=>{if(subscriptionDraft)subscriptionDraft.name=event.currentTarget.value||null;}}/></Field>
        {#if client && hasAccounts(subscriptionDraft.target.provider)}<AccountPicker
            {client}
            provider={subscriptionDraft.target.provider}
            bind:value={subscriptionDraft.credential_profile}
            revision={accountRevision}
          />{/if}
        {#if !subscriptionDraft.search}<SelectPicker
          label="Action"
          bind:value={subscriptionDraft.action}
          options={[
            { id: "notify", label: subscriptionActions.notify },
            { id: "download", label: subscriptionActions.download },
          ]}
        />
        {/if}
        <Field label="Check every (minutes)"
          ><input
            type="number"
            min="15"
            max="10080"
            required
            bind:value={subscriptionDraft.interval_minutes}
          /></Field
        >
        {#if !subscriptionDraft.search}
        {#if subscriptionDraft.action === "download"}<SelectPicker
          label="Destination"
          bind:value={subscriptionDraft.destination_id}
          options={destinations.map((destination) => ({
            id: destination.id,
            label: destination.label,
          }))}
        />
        {/if}
        {#if subscriptionDraft.recipe !== "original_images"}
        {#if !isMedia(subscriptionDraft.target.provider)}<LanguagePicker
            bind:value={editLanguages}
            label="Languages"
          />
          <Field label="Release groups (comma-separated; blank for all)"
            ><input bind:value={editGroups} /></Field
          >{/if}
        <OutputOptions
          media={isMedia(subscriptionDraft.target.provider)}
          bind:recipe={subscriptionDraft.recipe}
          bind:maxHeight={subscriptionDraft.policy.max_height}
          bind:subtitles={editSubtitles}
          bind:automaticSubtitles={subscriptionDraft.policy.automatic_subtitles}
        />
        {:else if subscriptionDraft.action === "download"}<p>Every image in each post is saved at original quality, together in one folder.</p>{/if}
        {/if}
        <p>
          {#if subscriptionDraft.recipe === "original_images"}Changes apply to future checks. Saved posts and download history are kept.{:else if subscriptionDraft.search}OMD notifies you when new items match this saved search. Changing accounts starts a fresh baseline.{:else}New filters and accounts apply to future checks. Previous releases and
          download history are kept. Queued downloads keep their current
          settings.{/if}
        </p>
        <label class="v2-check"
          ><input
            type="checkbox"
            bind:checked={subscriptionDraft.include_existing}
          /> {subscriptionDraft.recipe === "original_images" ? "Include existing posts when changing accounts" : subscriptionDraft.search ? "Include existing matches when changing accounts" : "Include newly matching existing releases when filters change"}</label
        >
      </form>
      {#snippet footer()}<Button
          type="submit"
          form="dialog-form-app-59334"
          variant="primary"
          disabled={!!busy || (subscriptionDraft?.action === "download" && !subscriptionDraft.destination_id)}>Save subscription</Button
        >{/snippet}</Dialog
    >{/if}
  {#if subscribeOpen && details && details.summary?.profile && client}
    <ProfileSubscriptionDialog collection={details} {destinations} {client} account={accountFor(details.reference.provider)} hasAccounts={hasAccounts(details.reference.provider)} {accountRevision} destination={destinationId} busy={!!busy} {error} onclose={() => subscribeOpen = false} onsubmit={subscribeProfile}/>
  {:else if subscribeOpen && details}<Dialog
      {error}
      title={subscriptionLabel(details)}
      onclose={() => (subscribeOpen = false)}
      ><p>{details.title}</p>
      {#if mediaSource}<p>OMD checks this {details.kind === "channel" ? "channel for new videos" : "playlist for new additions"}.{#if detailsSourceName}{" "}This does not change your subscriptions on {detailsSourceName}.{/if}</p>{/if}
      {#if client && hasAccounts(details.reference.provider)}<AccountPicker
          {client}
          provider={details.reference.provider}
          bind:value={accountProfiles[details.reference.provider]}
          revision={accountRevision}
        />{/if}
      <SelectPicker
        label="Action"
        bind:value={automatic}
        options={[
          { id: false, label: subscriptionActions.notify },
          { id: true, label: subscriptionActions.download },
        ]}
      /><SelectPicker
        label="Starting point"
        bind:value={futureOnly}
        options={[
          { id: true, label: "Only future releases" },
          { id: false, label: "Include existing missing releases" },
        ]}
      /><Field label="Check every (minutes)"
        ><input
          type="number"
          min="15"
          max="10080"
          bind:value={schedule}
        /></Field
      ><SelectPicker
        label="Destination"
        bind:value={destinationId}
        options={destinations.map((destination) => ({
          id: destination.id,
          label: destination.label,
        }))}
      />
      <p>{mediaSource ? "Uses the current format, resolution, and subtitle settings." : "Uses the current language, release group, and Save as settings."}</p>
      {#snippet footer()}
        <Button
          type="submit"
          variant="primary"
          disabled={!destinationId || !!busy}
          onclick={subscribe}>{subscriptionLabel(details!)}</Button
        >
      {/snippet}</Dialog
    >{/if}
  {#if sourceReview}{@const review = pluginReview(sourceReview.manifest)}{@const updating = sources.some((s) => s.manifest.id === sourceReview.manifest.id)}<Dialog
      {error}
      title={`${updating ? "Update" : "Install"} ${sourceReview.manifest.name}`}
      cancelLabel={updating ? "Don’t update" : "Don’t install"}
      onclose={() => (sourceReview = null)}
      >{#if sourceReview.manifest.description}<p>{sourceReview.manifest.description}</p>{/if}
      <p class="plugin-trust"><ShieldAlert size={16} aria-hidden="true" /><span>Only install plugins from people you trust.</span></p>
      <section class="plugin-permissions" aria-labelledby="plugin-hosts-heading">
        <h3 id="plugin-hosts-heading">This plugin can connect to:</h3>
        <ul>
          {#each review.hosts as host}<li>{hostLabel(host)}</li>{:else}<li>No websites</li>{/each}
        </ul>
        {#if review.usesAccount || review.mediaTools || review.browser || review.signIn}<ul class="plugin-abilities">
            {#if review.usesAccount}<li>It may use an account you add.</li>{/if}
            {#if review.mediaTools}<li>It can download and convert video and audio.</li>{/if}
            {#if review.browser}<li>It can load pages from these sites in a hidden browser window.</li>{/if}
            {#if review.signIn}<li>It can open a sign-in window for {review.signIn.host}.{#if review.signInGrants.length}{" "}That window can also connect to:
                <ul class="plugin-sign-in" aria-label="Sign-in window connections">
                  {#each review.signInGrants as grant}<li>
                      <span class="plugin-sign-in-hosts">{grant.hosts.map(hostLabel).join(", ")}</span>
                      <span class="plugin-sign-in-authority" class:sends={grant.account}>{signInAuthority(grant.account)}</span>
                    </li>{/each}
                </ul>{/if}</li>{/if}
          </ul>{/if}
      </section>
      <p>
        You’re approving version {sourceReview.manifest.version} of this exact file.
        If the file changes, OMD asks you again.
      </p>
      <details class="package-identity">
        <summary>Details</summary>
        <dl class="plugin-details">
          {#each review.grants as grant}<div>
              <dt>{grant.hosts.join(", ")}</dt>
              <dd>Request types: {grant.methods.join(", ")}{grant.account ? " · may use your account" : ""}</dd>
            </div>{/each}
          {#if sourceReview.manifest.sign_in}{#each review.signInGrants as grant}<div>
                <dt>Sign-in window: {grant.hosts.join(", ")}</dt>
                <dd>Starts at {sourceReview.manifest.sign_in.url} · Request types: {grant.methods.join(", ")}</dd>
              </div>{/each}{/if}
          <div>
            <dt>Package fingerprint</dt>
            <dd><code>{sourceReview.digest}</code></dd>
            <dd>This identifies the package contents you reviewed. It isn’t the downloaded file’s checksum.</dd>
          </div>
        </dl>
        <p>OMD keeps your account details separate from the plugin.</p>
      </details>
      {#if busy === "Installing source"}<p role="status">
          Preparing the source for this device…
        </p>{/if}
      {#snippet footer()}
        <Button
          type="submit"
          variant="primary"
          disabled={!!busy}
          onclick={installSource}
          >{busy === "Installing source"
            ? "Installing…"
            : updating
              ? "Approve update"
              : "Approve and install"}</Button
        >
      {/snippet}</Dialog
    >{/if}
  {#if cancelConfirm}<Dialog
      title={cancelConfirm.count === 1 ? "Cancel this download?" : `Cancel ${plural(cancelConfirm.count, "download", "downloads")}?`}
      cancelLabel={cancelConfirm.count === 1 ? "Keep download" : "Keep downloads"}
      onclose={() => settleCancel(false)}
    >
      <p>
        Partly downloaded data will be deleted. You can download {cancelConfirm.count === 1 ? "it" : "them"} again later.
      </p>
      {#snippet footer()}<Button variant="danger" onclick={() => settleCancel(true)}
          >{cancelConfirm?.count === 1 ? "Cancel download" : "Cancel downloads"}</Button
        >{/snippet}
    </Dialog>{/if}
  {#if dismissedUndo && !checkStartError && readyNotice?.state !== "failed"}<Toast
      message={dismissedUndo.ids.length > 1 ? `${dismissedUndo.ids.length} reviews dismissed` : `Review dismissed: ${dismissedUndo.title}`}
      actionLabel="Undo"
      actionId="undo-review-dismissal"
      action={() => {
        const ids = new Set(dismissedUndo!.ids), last = dismissedUndo!.ids.at(-1)!;
        dismissedChecks = dismissedChecks.filter(id => !ids.has(id)); dismissedUndo = null;
        void tick().then(() => document.getElementById(`check-actions-${last}`)?.querySelector<HTMLElement>("button")?.focus());
      }}
      onclose={() => (dismissedUndo = null)}
      dismissLabel="Dismiss undo notification"
    />{/if}
  {#if !dismissedUndo && (notice || noMissingNotice) && !readyNotice && !downloadNotice && !checkStartError}<Toast
      message={notice || noMissingNotice}
      onclose={() => { if (notice) notice = ""; else noMissingNotice = ""; }}
      dismissLabel="Dismiss notification"
    />{/if}
  {#if checkStartError}<Toast
      message={checkStartError}
      kind="error"
      onclose={() => (checkStartError = "")}
      dismissLabel="Dismiss check error"
    />{:else if readyNotice && (!dismissedUndo || readyNotice.state === "failed")}<Toast
      message={checkMessage}
      progress={noticeChecking
        ? {
            value: readyNotice.processed,
            total: readyNotice.kind === "batch" ? readyNotice.total : undefined,
            label:
              readyNotice.kind === "batch"
                ? `${readyNotice.processed} of ${readyNotice.total} prepared`
                : `${readyNotice.processed} ${readyNotice.request.release_refs ? "posts checked" : "releases found"}`,
          }
        : undefined}
      kind={readyNotice.state === "failed"
        ? "error"
        : noticeChecking
          ? "info"
          : "success"}
      actionLabel={noticeChecking
        ? "View progress"
        : readyNotice.state === "failed"
          ? checkIssue(readyNotice.issue)?.refresh ? "Refresh" : "View issue"
          : readyNotice.state === "submitted"
            ? "View downloads"
            : downloadContexts[readyNotice.id]?.empty
              ? "Adjust filters"
              : missingCount(readyNotice) === 0
                ? "View results"
                : downloadContexts[readyNotice.id]?.recipe === "original_images" ? "Review downloads" : isMedia(downloadContexts[readyNotice.id]?.reference.provider ?? "") ? "Choose items" : "Choose chapters"}
      action={() => {
        const task = readyNotice!;
        readyNotices = readyNotices.slice(1);
        if (task.state === "submitted") {
          void navigate("Downloads");
        } else if (task.state === "failed" && checkIssue(task.issue)?.refresh)
          void refreshCheck(task);
        else void openCheck(task);
      }}
      onclose={() => (readyNotices = readyNotices.slice(1))}
    />{/if}
  {#if !dismissedUndo && downloadNotice && !readyNotice && !checkStartError}<Toast
      message={downloadNotice.created === 0
        ? "Matching downloads already exist"
        : downloadNotice.created === 1
          ? "Download added"
          : `${downloadNotice.created} downloads added`}
      onclose={() => (downloadNotice = null)}
    />{/if}
  {#if unsubscribeConfirm}<Dialog
      title="Unsubscribe?"
      onclose={() => (unsubscribeConfirm = false)}
    >
      <p>
        Stop checking {details?.title} for new releases? Your downloads and history
        will remain.
      </p>
      {#snippet footer()}<Button
          variant="danger"
          disabled={!!busy}
          onclick={unsubscribeItem}>Unsubscribe</Button
        >{/snippet}
    </Dialog>{/if}
  {#if removal}<RemovalDialog
      client={client!}
      jobs={removal.jobs}
      mode={removal.mode}
      onclose={() => (removal = null)}
      onchanged={() => {
        fileRevision++;
        void refresh("jobs");
      }}
    />{/if}
  {#if filesOpen}<Dialog
      {error}
      status={fileNotice}
      title="Download details"
      onclose={() => (filesOpen = null)}
      ><SavedFiles
        oncollection={(c) => {
          filesOpen = null;
          void openCollection(c);
        }}
        job={filesOpen}
        source={sources.find(
          (s) =>
            s.manifest.id === filesOpen?.plan.collection.reference.provider,
        )?.manifest.name ?? filesOpen.plan.collection.reference.provider}
        sourceRevision={releases.find(
          (r) =>
            sourceKey(r.reference) ===
            sourceKey(filesOpen!.plan.release.reference),
        )?.revision}
        {files}
        {native}
        busy={!!busy}
        cursor={fileCursor}
        path={(file) => filePath(filesOpen!, file)}
        onopen={(file, reveal) => openFile(filesOpen!, file, reveal)}
        oncopy={(file) => copy(filePath(filesOpen!, file))}
        onmore={() =>
          quietRun("Loading download details", async () => {
            const page = await client!.request<Page<Artifact>>(
              `/v2/jobs/${filesOpen!.id}/files?cursor=${encodeURIComponent(fileCursor!)}`,
            );
            files = [...files, ...page.items];
            fileCursor = page.next_cursor;
          })}
        >{#snippet management()}
          <div class="ui-actions">
            <Button
              disabled={!!busy}
              onclick={() => prepareAnotherVersion(filesOpen!)}
              >Download another copy</Button
            ><Button variant="ghost" onclick={() => manageFiles("reconcile")}
              >Check file integrity</Button
            >
          </div>
          <div class="ui-actions">
            {#each Object.entries(removalLabels) as [mode, label]}<Button
                variant="danger"
                onclick={() => {
                  removal = { jobs: [filesOpen!], mode: mode as RemovalMode };
                  filesOpen = null;
                }}>{label}</Button
              >{/each}
          </div>
        {/snippet}</SavedFiles
      ></Dialog
    >{/if}

  {#if pendingReferences}<Dialog
      {error}
      title="Choose download options"
      onclose={() => (pendingReferences = null)}
    >
      <p>
        {pendingReferences.length}
        {pendingReferences.length === 1 ? "item selected" : "items selected"}
      </p>
      {#if client && hasAccounts(pendingReferences[0].provider)}<AccountPicker
          {client}
          provider={pendingReferences[0].provider}
          bind:value={accountProfiles[pendingReferences[0].provider]}
          revision={accountRevision}
        />{/if}
      <SelectPicker
        label="Destination"
        bind:value={destinationId}
        options={destinations.map((destination) => ({
          id: destination.id,
          label: destination.label,
        }))}
      />
      <OutputOptions
        media={isMedia(pendingReferences[0].provider)}
        bind:recipe
        bind:maxHeight
        bind:subtitles
        bind:automaticSubtitles
      />

      {#snippet footer()}
        <Button
          type="submit"
          variant="primary"
          disabled={!!busy || !destinationId}
          onclick={() =>
            run("Checking files", async () => {
              await prepareReferences(pendingReferences!);
              pendingReferences = null;
            })}>Review downloads</Button
        >{/snippet}</Dialog
    >{/if}

  {#if selectionTask}<DownloadCheck
      task={selectionTask}
      context={downloadContexts[selectionTask.id]}
      {destinations}
      busy={!!busy}
      {error}
      onclose={() => (selectionTask = null)}
      onaction={selectionAction}
      onreview={reviewBatch}
      onoptions={() => chooseCheckOptions(selectionTask!)}
      ondismiss={() => dismissCheck(selectionTask!)}
      onrefresh={() => refreshCheck(selectionTask!)}
    />{/if}
  {#if anotherFormat}<AnotherFormatDialog
      bind:choice={anotherFormat}
      busy={!!busy}
      {error}
      onclose={() => (anotherFormat = null)}
      onreview={prepareAnotherFormat}
    />{/if}
  {#if imageDetailDownload}<ImageDownloadDialog items={imageDetailDownload} {destinations} onclose={() => imageDetailDownload = null} onstart={prepareImages}/>{/if}
  {#if downloadDraft}<DownloadOptionsDialog
      title={downloadDraft.context.title}
      {destinations}
      media={isMedia(downloadDraft.context.reference.provider)}
      languages={downloadDraft.languages.map((id) => ({
        id,
        label: languageName(id),
      }))}
      groups={downloadDraft.groups}
      bind:destination={downloadDraft.context.destination_id}
      bind:recipe={downloadDraft.context.recipe}
      bind:language={downloadDraft.language}
      bind:group={downloadDraft.group}
      bind:maxHeight={downloadDraft.maxHeight}
      bind:subtitles={downloadDraft.subtitles}
      bind:automaticSubtitles={downloadDraft.automaticSubtitles}
      bind:automaticDownload={downloadDraft.context.autoDownload}
      busy={!!busy}
      {error}
      onclose={() => (downloadDraft = null)}
      oncheck={() => beginDownloadCheck()}
    />{/if}

  {#if client && accountsSource}<SourceAccounts
      {client}
      {lease}
      source={accountsSource}
      onclose={() => (accountsSource = null)}
      onchange={(connectedProfile) => {
        if (connectedProfile && accountsSource)
          accountProfiles[accountsSource.id] = connectedProfile;
        accountRevision++;
        clearSectionCache(client!);
        clearItemCache(client!);
      }}
    />{/if}
{/if}

{#snippet pluginPrerequisite()}<PluginPrerequisite
    description={sourcePrerequisite}
    importLabel={firstImportLabel}
    busy={!!busy}
    onimport={importFirstSource}
    onerror={(message) => (error = message)}
  />{/snippet}
<!-- On Sources itself, included plugins are listed below, so the action is the file import. -->
{#snippet pluginFilePrerequisite()}<PluginPrerequisite
    description={sourcePrerequisite}
    busy={!!busy}
    onimport={() => void pickPackage()}
    onerror={(message) => (error = message)}
  />{/snippet}

<style>
  .page-heading-action {margin-left:auto;}

  .release-layout-toolbar :global([aria-pressed="true"]) {background:var(--surface-raised);color:var(--text);}
  .release-layout-toolbar {display:flex;justify-content:flex-end;gap:var(--theme-app-gap-1, 6px);margin-left:auto;}
  .media-filters {display:none;}
  .media-selection {position:sticky;top:0;z-index:4;background:var(--bg);padding:var(--theme-app-padding-2, 10px) 0;}
  .media-selection :global(.ui-button.primary) {margin-left:0;}

  .video-selection {display:flex;align-items:center;justify-content:space-between;gap:var(--theme-app-gap-3, 12px);min-height:var(--theme-app-min-height-4, 30px);font-size:var(--theme-app-font-size-5, 12px);color:var(--muted);}
  .video-selection :global(.ui-button) {padding:var(--theme-app-padding-6, 3px) var(--theme-app-padding-7, 6px);min-height:var(--theme-app-min-height-8, 28px);}
  .release-title-link {border:0;background:transparent;padding:0;color:var(--text);font:inherit;font-weight:var(--theme-app-font-weight-9, 650);text-align:left;text-decoration:underline;text-underline-offset:var(--theme-app-text-underline-offset-10, 3px);cursor:pointer;}
  .release-title-link:hover {color:var(--accent-text)}
  .media-table table {min-width:1000px;}
  .media-table .release-title-link {flex:1;min-width:0;justify-content:flex-start;}
  .release-thumbnail {width:var(--theme-app-width-11, 112px);aspect-ratio:16/9;flex-shrink:0;}
  .release-thumbnail :global(.artwork) {height:100%;width:100%;border-radius:var(--theme-app-border-radius-12, 6px);overflow:hidden;}
  .release-thumbnail :global(img) {height:100%;width:100%;object-fit:cover;}
  .v2-table-wrap td > small.release-facts {display:flex;flex-wrap:wrap;gap:var(--theme-app-gap-13, 8px);}
  .release-facts span + span::before {content:"·";margin-right:var(--theme-app-margin-right-14, 8px);}

  .download-check-section {
    display: grid;
    gap: var(--theme-app-gap-3, 12px);
    margin-bottom: var(--theme-app-margin-bottom-15, 24px);
  }
  .download-check-section h2 {
    font-size: var(--theme-app-font-size-16, 15px);
  }
</style>
