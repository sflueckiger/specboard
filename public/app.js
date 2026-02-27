/**
 * Specboard - OpenSpec Progress Dashboard
 *
 * A single-page application for monitoring OpenSpec feature progress.
 * Features real-time updates via SSE, kanban-style task tracking,
 * and interactive Manual QA subtask toggling.
 */

// =============================================================================
// Application State
// =============================================================================

let currentRepo = null;        // Currently selected repository name
let currentView = 'live';      // Current view: 'live' or 'features'
let currentFeature = null;     // Currently viewed feature (in detail view)
let featuresData = [];         // Cached features data for current repo
let eventSource = null;        // SSE connection for real-time updates
let browsingPath = '/';        // Current path in directory browser modal

// =============================================================================
// DOM Elements
// =============================================================================

const currentPathEl = document.getElementById('current-path');
const changePathBtn = document.getElementById('change-path');
const repoSelect = document.getElementById('repo-select');
const swimlanes = document.getElementById('swimlanes');
const navItems = document.querySelectorAll('.nav-item');

// Views
const liveView = document.getElementById('live-view');
const featuresView = document.getElementById('features-view');
const featureDetailView = document.getElementById('feature-detail-view');
const featuresList = document.getElementById('features-list');
const breadcrumbs = document.getElementById('breadcrumbs');
const featureDetailHeader = document.getElementById('feature-detail-header');
const artifactTabs = document.getElementById('artifact-tabs');
const artifactContent = document.getElementById('artifact-content');

// Modal elements
const modal = document.getElementById('dir-modal');
const modalCurrentPath = document.getElementById('modal-current-path');
const dirList = document.getElementById('dir-list');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSelect = document.getElementById('modal-select');

// Sidebar elements
const subtasksSidebar = document.getElementById('subtasks-sidebar');
const sidebarTaskTitle = document.getElementById('sidebar-task-title');
const sidebarSubtasks = document.getElementById('sidebar-subtasks');
const sidebarClose = document.getElementById('sidebar-close');

// LocalStorage keys
const STORAGE_KEYS = {
  rootPath: 'specboard_rootPath',
  repo: 'specboard_repo'
};

// =============================================================================
// URL Routing
// =============================================================================

/** Get current URL query parameters */
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    view: params.get('view') || 'live',
    repo: params.get('repo'),
    feature: params.get('feature'),
    tab: params.get('tab')
  };
}

function updateUrlParams(updates) {
  const params = new URLSearchParams(window.location.search);

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  const newUrl = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;

  window.history.replaceState({}, '', newUrl);
}

// =============================================================================
// Initialization
// =============================================================================

/** Initialize the application */
async function init() {
  await loadConfig();
  await loadRepositories();

  // Get URL params
  const urlParams = getUrlParams();

  // Restore repo from URL or localStorage
  const repoToLoad = urlParams.repo || localStorage.getItem(STORAGE_KEYS.repo);
  if (repoToLoad && repoSelect.querySelector(`option[value="${repoToLoad}"]`)) {
    currentRepo = repoToLoad;
    repoSelect.value = repoToLoad;
    await loadFeatures(currentRepo);

    // Restore view and feature from URL
    if (urlParams.view === 'features' && urlParams.feature) {
      // Find the feature by name
      const feature = featuresData.find(f => f.name === urlParams.feature);
      if (feature) {
        currentView = 'features';
        navItems.forEach(item => {
          item.classList.toggle('active', item.dataset.view === 'features');
        });
        liveView.classList.add('hidden');
        openFeatureDetail(feature, urlParams.tab);
      } else {
        switchView(urlParams.view);
      }
    } else {
      switchView(urlParams.view);
    }
  } else {
    switchView('live');
  }

  setupEventSource();
  setupEventListeners();
}

// Load current config
async function loadConfig() {
  try {
    // Check if there's a saved path in localStorage
    const savedPath = localStorage.getItem(STORAGE_KEYS.rootPath);

    if (savedPath) {
      // Update server with saved path
      const updateRes = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: savedPath })
      });
      if (updateRes.ok) {
        currentPathEl.textContent = savedPath;
        browsingPath = savedPath;
        return;
      }
    }

    // Fall back to server's default
    const res = await fetch('/api/config');
    const data = await res.json();
    currentPathEl.textContent = data.rootPath;
    browsingPath = data.rootPath;
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

// =============================================================================
// Directory Browser Modal
// =============================================================================

/** Browse directory contents for path selection */
async function browseDirectory(path) {
  try {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
    const data = await res.json();

    if (data.error) {
      dirList.innerHTML = `<p class="empty-state">${data.error}</p>`;
      return;
    }

    browsingPath = data.current;
    modalCurrentPath.textContent = data.current;

    let html = '';
    if (data.parent) {
      html += `<div class="dir-item parent" data-path="${escapeHtml(data.parent)}">
        <span class="dir-icon">..</span>
        <span>Parent Directory</span>
      </div>`;
    }

    if (data.directories.length === 0) {
      html += '<p class="empty-state" style="padding: 1rem;">No subdirectories</p>';
    } else {
      html += data.directories.map(dir => `
        <div class="dir-item" data-path="${escapeHtml(dir.path)}">
          <span class="dir-icon">📁</span>
          <span>${escapeHtml(dir.name)}</span>
        </div>
      `).join('');
    }

    dirList.innerHTML = html;

    // Add click handlers
    dirList.querySelectorAll('.dir-item').forEach(item => {
      item.addEventListener('click', () => {
        browseDirectory(item.dataset.path);
      });
    });
  } catch (err) {
    console.error('Failed to browse directory:', err);
    dirList.innerHTML = '<p class="empty-state">Failed to load directory</p>';
  }
}

async function openModal() {
  // Try current path first, fall back to root
  const res = await fetch(`/api/browse?path=${encodeURIComponent(browsingPath)}`);
  const data = await res.json();

  if (data.error) {
    browsingPath = '/';
  }

  modal.classList.remove('hidden');
  browseDirectory(browsingPath);
}

function closeModal() {
  modal.classList.add('hidden');
}

async function selectDirectory() {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPath: browsingPath })
    });

    if (res.ok) {
      currentPathEl.textContent = browsingPath;
      localStorage.setItem(STORAGE_KEYS.rootPath, browsingPath);
      currentRepo = null;
      featuresData = [];
      localStorage.removeItem(STORAGE_KEYS.repo);
      repoSelect.value = '';
      await loadRepositories();
      swimlanes.innerHTML = '<p class="empty-state">Select a repository to view live progress</p>';
      featuresList.innerHTML = '<p class="empty-state">Select a repository to view features</p>';
      closeModal();
    }
  } catch (err) {
    console.error('Failed to set path:', err);
  }
}

// =============================================================================
// Data Loading
// =============================================================================

/** Load available repositories from API */
async function loadRepositories() {
  try {
    const res = await fetch('/api/repositories');
    const repos = await res.json();

    repoSelect.innerHTML = '<option value="">Select Repository</option>';
    repos.forEach(repo => {
      const option = document.createElement('option');
      option.value = repo.name;
      option.textContent = `${repo.name} (${repo.worktrees.length} worktrees)`;
      repoSelect.appendChild(option);
    });

    if (currentRepo) {
      repoSelect.value = currentRepo;
    }
  } catch (err) {
    console.error('Failed to load repositories:', err);
  }
}

// Load features for a repository
async function loadFeatures(repoName) {
  if (!repoName) {
    swimlanes.innerHTML = '<p class="empty-state">Select a repository to view live progress</p>';
    featuresList.innerHTML = '<p class="empty-state">Select a repository to view features</p>';
    return;
  }

  try {
    const res = await fetch(`/api/repositories/${encodeURIComponent(repoName)}`);
    featuresData = await res.json();

    if (currentView === 'live') {
      renderFeatures(featuresData);
    } else if (currentView === 'features') {
      renderFeaturesList();
    }
  } catch (err) {
    console.error('Failed to load features:', err);
    swimlanes.innerHTML = '<p class="empty-state">Failed to load features</p>';
    featuresList.innerHTML = '<p class="empty-state">Failed to load features</p>';
  }
}

// =============================================================================
// Live View Rendering
// =============================================================================

/** Render features as swimlanes with kanban columns */
function renderFeatures(features) {
  // Filter out archived features
  const activeFeatures = features.filter(f => !f.isArchived);

  if (activeFeatures.length === 0) {
    swimlanes.innerHTML = '<p class="empty-state">No features found in this repository</p>';
    return;
  }

  swimlanes.innerHTML = activeFeatures.map(feature => renderFeatureLane(feature)).join('');

  // Add click handlers for action buttons (Finder, VS Code, Terminal)
  swimlanes.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const path = btn.dataset.path;
      try {
        await fetch(`/api/open/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
      } catch (err) {
        console.error(`Failed to open ${action}:`, err);
      }
    });
  });

  // Re-initialize Lucide icons for dynamically added content
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Add click handlers for task cards
  swimlanes.querySelectorAll('.task-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const task = JSON.parse(card.dataset.task);
      openSubtasksSidebar(task);
    });
  });

  // Add click handlers for artifact badge links
  swimlanes.querySelectorAll('.badge-link.active').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const lane = badge.closest('.feature-lane');
      const feature = JSON.parse(lane.dataset.feature);
      const artifact = badge.dataset.artifact;
      openFeatureDetailWithTab(feature, artifact);
    });
  });
}

function openSubtasksSidebar(task) {
  sidebarTaskTitle.innerHTML = `
    <span class="sidebar-feature-name">${escapeHtml(task.featureName)}</span>
    <span class="sidebar-task-name">${task.id}. ${formatMarkdown(task.title)}</span>
  `;

  // Split subtasks into regular and manual verification
  const regularSubtasks = task.subtasks.filter(s => !isManualSubtask(s.title));
  const manualSubtasks = task.subtasks.filter(s => isManualSubtask(s.title));

  let html = '';

  // Render regular subtasks
  html += regularSubtasks.map(subtask => `
    <div class="sidebar-subtask-item">
      <span class="subtask-checkbox ${subtask.completed ? 'completed' : 'pending'}">
        ${subtask.completed ? '✓' : '○'}
      </span>
      <span class="subtask-title">${formatMarkdown(subtask.title)}</span>
    </div>
  `).join('');

  // Render manual QA subtasks with header
  if (manualSubtasks.length > 0) {
    html += `<div class="sidebar-section-header">Manual Verification</div>`;
    html += manualSubtasks.map(subtask => `
      <div class="sidebar-subtask-item interactive"
           data-subtask-id="${escapeHtml(subtask.id)}" data-feature-path="${escapeHtml(task.featurePath)}">
        <span class="subtask-checkbox ${subtask.completed ? 'completed' : 'pending'}">
          ${subtask.completed ? '✓' : '○'}
        </span>
        <span class="subtask-title">${formatMarkdown(subtask.title)}</span>
      </div>
    `).join('');
  }

  sidebarSubtasks.innerHTML = html;

  // Add click handlers for interactive Manual QA subtasks
  sidebarSubtasks.querySelectorAll('.sidebar-subtask-item.interactive').forEach(item => {
    item.addEventListener('click', async () => {
      const subtaskId = item.dataset.subtaskId;
      const featurePath = item.dataset.featurePath;
      const checkbox = item.querySelector('.subtask-checkbox');

      // Optimistic UI update
      const wasCompleted = checkbox.classList.contains('completed');
      checkbox.classList.toggle('completed');
      checkbox.classList.toggle('pending');
      checkbox.textContent = wasCompleted ? '○' : '✓';

      try {
        const res = await fetch('/api/subtask/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ featurePath, subtaskId })
        });

        if (!res.ok) {
          // Revert on error
          checkbox.classList.toggle('completed');
          checkbox.classList.toggle('pending');
          checkbox.textContent = wasCompleted ? '✓' : '○';
        }
      } catch (err) {
        // Revert on error
        checkbox.classList.toggle('completed');
        checkbox.classList.toggle('pending');
        checkbox.textContent = wasCompleted ? '✓' : '○';
      }
    });
  });

  subtasksSidebar.classList.remove('hidden');
}

function closeSubtasksSidebar() {
  subtasksSidebar.classList.add('hidden');
}

// =============================================================================
// View Navigation
// =============================================================================

/** Switch between Live and Features views */
function switchView(view) {
  currentView = view;
  currentFeature = null;

  // Update URL params
  updateUrlParams({ view, feature: null, tab: null });

  // Update nav
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  // Hide all views
  liveView.classList.add('hidden');
  featuresView.classList.add('hidden');
  featureDetailView.classList.add('hidden');

  // Show selected view
  if (view === 'live') {
    liveView.classList.remove('hidden');
    if (currentRepo) loadFeatures(currentRepo);
  } else if (view === 'features') {
    featuresView.classList.remove('hidden');
    if (currentRepo) renderFeaturesList();
  }
}

// =============================================================================
// Features List View
// =============================================================================

/** Render features as clickable cards */
function renderFeaturesList() {
  const activeFeatures = featuresData.filter(f => !f.isArchived);

  if (activeFeatures.length === 0) {
    featuresList.innerHTML = '<p class="empty-state">No features found in this repository</p>';
    return;
  }

  featuresList.innerHTML = activeFeatures.map((feature, index) => `
    <div class="feature-list-card" data-feature-index="${index}">
      <div class="feature-list-left">
        <span class="feature-list-name">${escapeHtml(feature.name)}</span>
        <div class="feature-list-worktree">
          <i data-lucide="folder-git-2" class="worktree-icon"></i>
          <span class="worktree-name">${escapeHtml(feature.worktree)}</span>
          <div class="worktree-actions">
            <button class="action-btn" data-action="finder" data-path="${escapeHtml(feature.worktreePath)}" title="Open in Finder">
              <i data-lucide="folder-open"></i>
            </button>
            <button class="action-btn" data-action="vscode" data-path="${escapeHtml(feature.worktreePath)}" title="Open in VS Code">
              <i data-lucide="code"></i>
            </button>
            <button class="action-btn" data-action="terminal" data-path="${escapeHtml(feature.worktreePath)}" title="Open in Terminal">
              <i data-lucide="terminal"></i>
            </button>
          </div>
        </div>
      </div>
      <div class="feature-list-right">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </div>
  `).join('');

  // Add click handlers
  featuresList.querySelectorAll('.feature-list-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.open-folder-btn')) return;
      const index = parseInt(card.dataset.featureIndex);
      const activeFeatures = featuresData.filter(f => !f.isArchived);
      openFeatureDetail(activeFeatures[index]);
    });
  });

  featuresList.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const path = btn.dataset.path;
      try {
        await fetch(`/api/open/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
      } catch (err) {
        console.error(`Failed to open ${action}:`, err);
      }
    });
  });

  // Re-initialize Lucide icons for dynamically added content
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Open feature detail view with specific tab
function openFeatureDetailWithTab(feature, tabId) {
  // Switch to features view first, then open detail
  currentView = 'features';
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === 'features');
  });
  liveView.classList.add('hidden');
  featuresView.classList.add('hidden');

  openFeatureDetail(feature, tabId);
}

// Open feature detail view
function openFeatureDetail(feature, initialTab = null) {
  currentFeature = feature;

  // Hide features list, show detail
  featuresView.classList.add('hidden');
  featureDetailView.classList.remove('hidden');

  // Render breadcrumbs
  breadcrumbs.innerHTML = `
    <a href="#" class="breadcrumb-link" id="back-to-features">Features</a>
    <span class="breadcrumb-sep">/</span>
    <span class="breadcrumb-current">${escapeHtml(feature.name)}</span>
  `;

  document.getElementById('back-to-features').addEventListener('click', (e) => {
    e.preventDefault();
    featureDetailView.classList.add('hidden');
    featuresView.classList.remove('hidden');
    currentFeature = null;
    updateUrlParams({ feature: null, tab: null });
  });

  // Render header with worktree toolbar
  featureDetailHeader.innerHTML = `
    <h2>${escapeHtml(feature.name)}</h2>
    <div class="feature-detail-worktree">
      <i data-lucide="folder-git-2" class="worktree-icon"></i>
      <span class="worktree-name">${escapeHtml(feature.worktree)}</span>
      <div class="worktree-actions">
        <button class="action-btn" data-action="finder" data-path="${escapeHtml(feature.worktreePath)}" title="Open in Finder">
          <i data-lucide="folder-open"></i>
        </button>
        <button class="action-btn" data-action="vscode" data-path="${escapeHtml(feature.worktreePath)}" title="Open in VS Code">
          <i data-lucide="code"></i>
        </button>
        <button class="action-btn" data-action="terminal" data-path="${escapeHtml(feature.worktreePath)}" title="Open in Terminal">
          <i data-lucide="terminal"></i>
        </button>
      </div>
    </div>
  `;

  // Add click handlers for action buttons
  featureDetailHeader.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const path = btn.dataset.path;
      try {
        await fetch(`/api/open/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
      } catch (err) {
        console.error(`Failed to open ${action}:`, err);
      }
    });
  });

  // Re-initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Render tabs
  const hasSpecs = feature.specs && feature.specs.length > 0;
  const tabs = [
    { id: 'proposal', label: 'Proposal', enabled: feature.hasProposal },
    { id: 'specs', label: 'Specification', enabled: hasSpecs },
    { id: 'design', label: 'Design', enabled: feature.hasDesign },
    { id: 'plan', label: 'Plan', enabled: feature.hasPlan },
  ];

  artifactTabs.innerHTML = tabs.map(tab => `
    <button class="artifact-tab ${tab.enabled ? '' : 'disabled'}"
            data-artifact="${tab.id}"
            ${tab.enabled ? '' : 'disabled'}>
      ${tab.label}
    </button>
  `).join('');

  // Add tab click handlers
  artifactTabs.querySelectorAll('.artifact-tab:not(.disabled)').forEach(tab => {
    tab.addEventListener('click', () => {
      artifactTabs.querySelectorAll('.artifact-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update URL with selected tab
      updateUrlParams({ tab: tab.dataset.artifact });

      if (tab.dataset.artifact === 'specs') {
        renderSpecsTab(feature);
      } else if (tab.dataset.artifact === 'design') {
        loadDesignArtifact(feature.path);
      } else if (tab.dataset.artifact === 'plan') {
        loadPlanArtifact(feature.path);
      } else {
        loadArtifact(feature.path, tab.dataset.artifact);
      }
    });
  });

  // Determine which tab to show
  let tabToShow = initialTab ? tabs.find(t => t.id === initialTab && t.enabled) : null;
  if (!tabToShow) {
    tabToShow = tabs.find(t => t.enabled);
  }

  // Update URL with feature and tab
  updateUrlParams({ view: 'features', feature: feature.name, tab: tabToShow?.id || null });

  if (tabToShow) {
    artifactTabs.querySelector(`[data-artifact="${tabToShow.id}"]`).classList.add('active');
    if (tabToShow.id === 'specs') {
      renderSpecsTab(feature);
    } else if (tabToShow.id === 'design') {
      loadDesignArtifact(feature.path);
    } else if (tabToShow.id === 'plan') {
      loadPlanArtifact(feature.path);
    } else {
      loadArtifact(feature.path, tabToShow.id);
    }
  } else {
    artifactContent.innerHTML = '<p class="empty-state">No artifacts available for this feature</p>';
  }
}

// =============================================================================
// Artifact Rendering
// =============================================================================

/** Render specs tab with collapsible accordion sections */
function renderSpecsTab(feature) {
  const specs = feature.specs;

  // If single spec, just load it directly
  if (specs.length === 1 && specs[0] === '_single') {
    loadArtifact(feature.path, 'specs', '_single');
    return;
  }

  // Multiple specs - show collapsible accordion
  const accordionHtml = `
    <div class="spec-accordion">
      ${specs.map(spec => `
        <div class="spec-section" data-spec="${escapeHtml(spec)}">
          <button class="spec-section-header">
            <svg class="spec-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span class="spec-section-title">${escapeHtml(spec)}</span>
          </button>
          <div class="spec-section-content"></div>
        </div>
      `).join('')}
    </div>
  `;

  artifactContent.innerHTML = accordionHtml;

  // Add click handlers for accordion headers
  artifactContent.querySelectorAll('.spec-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.spec-section');
      const isExpanded = section.classList.contains('expanded');

      if (isExpanded) {
        section.classList.remove('expanded');
      } else {
        section.classList.add('expanded');
        // Load content if not already loaded
        const content = section.querySelector('.spec-section-content');
        if (!content.dataset.loaded) {
          loadSpecContent(feature.path, section.dataset.spec, content);
        }
      }
    });
  });
}

// Load specific spec content
async function loadSpecContent(featurePath, specName, container) {
  container.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const res = await fetch(`/api/artifact?path=${encodeURIComponent(featurePath)}&artifact=specs&spec=${encodeURIComponent(specName)}`);
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p class="empty-state">${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `<div class="markdown-content">${renderMarkdown(data.content)}</div>`;
    container.dataset.loaded = 'true';
  } catch (err) {
    console.error('Failed to load spec:', err);
    container.innerHTML = '<p class="empty-state">Failed to load spec</p>';
  }
}

// Load and render artifact content
async function loadArtifact(featurePath, artifact, spec = null) {
  artifactContent.innerHTML = '<p class="loading">Loading...</p>';

  try {
    let url = `/api/artifact?path=${encodeURIComponent(featurePath)}&artifact=${artifact}`;
    if (spec) {
      url += `&spec=${encodeURIComponent(spec)}`;
    }
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      artifactContent.innerHTML = `<p class="empty-state">${escapeHtml(data.error)}</p>`;
      return;
    }

    artifactContent.innerHTML = `<div class="markdown-content">${renderMarkdown(data.content)}</div>`;
  } catch (err) {
    console.error('Failed to load artifact:', err);
    artifactContent.innerHTML = '<p class="empty-state">Failed to load artifact</p>';
  }
}

// Load and render design artifact with collapsible sections
async function loadDesignArtifact(featurePath) {
  artifactContent.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const res = await fetch(`/api/artifact?path=${encodeURIComponent(featurePath)}&artifact=design`);
    const data = await res.json();

    if (data.error) {
      artifactContent.innerHTML = `<p class="empty-state">${escapeHtml(data.error)}</p>`;
      return;
    }

    // Split content by H2 headers
    const sections = parseDesignSections(data.content);

    if (sections.length === 0) {
      // No sections found, render as regular markdown
      artifactContent.innerHTML = `<div class="markdown-content">${renderMarkdown(data.content)}</div>`;
      return;
    }

    // Render as accordion
    const accordionHtml = `
      <div class="design-accordion">
        ${sections.map((section, index) => `
          <div class="design-section ${index === 0 ? 'expanded' : ''}" data-section="${index}">
            <button class="design-section-header">
              <svg class="design-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <span class="design-section-title">${escapeHtml(section.title)}</span>
            </button>
            <div class="design-section-content">
              <div class="markdown-content">${renderMarkdown(section.content)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    artifactContent.innerHTML = accordionHtml;

    // Add click handlers for accordion headers
    artifactContent.querySelectorAll('.design-section-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.design-section');
        section.classList.toggle('expanded');
      });
    });
  } catch (err) {
    console.error('Failed to load design:', err);
    artifactContent.innerHTML = '<p class="empty-state">Failed to load design</p>';
  }
}

// Load and render plan artifact with collapsible task cards
async function loadPlanArtifact(featurePath) {
  artifactContent.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const res = await fetch(`/api/artifact?path=${encodeURIComponent(featurePath)}&artifact=plan`);
    const data = await res.json();

    if (data.error) {
      artifactContent.innerHTML = `<p class="empty-state">${escapeHtml(data.error)}</p>`;
      return;
    }

    // Parse tasks from the content
    const tasks = parsePlanTasks(data.content);

    if (tasks.length === 0) {
      artifactContent.innerHTML = `<div class="markdown-content">${renderMarkdown(data.content)}</div>`;
      return;
    }

    // Render as task cards
    const cardsHtml = `
      <div class="plan-tasks">
        ${tasks.map((task, index) => {
          const regularSubtasks = task.subtasks.filter(s => !isManualSubtask(s.title));
          const manualSubtasks = task.subtasks.filter(s => isManualSubtask(s.title));
          const completedCount = task.subtasks.filter(s => s.completed).length;
          const totalCount = task.subtasks.length;
          const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
          const status = completedCount === 0 ? 'todo' : completedCount === totalCount ? 'done' : 'in-progress';

          return `
            <div class="plan-task-card ${index === 0 ? 'expanded' : ''}" data-task-index="${index}">
              <button class="plan-task-header">
                <svg class="plan-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                <span class="plan-task-id">${escapeHtml(task.id)}.</span>
                <span class="plan-task-title">${formatMarkdown(task.title)}</span>
                <span class="plan-task-progress ${status}">${completedCount}/${totalCount}</span>
              </button>
              <div class="plan-task-content">
                ${regularSubtasks.length > 0 ? `
                  <div class="plan-subtasks">
                    ${regularSubtasks.map(subtask => `
                      <div class="plan-subtask-item">
                        <span class="plan-subtask-checkbox ${subtask.completed ? 'completed' : 'pending'}">
                          ${subtask.completed ? '✓' : '○'}
                        </span>
                        <span class="plan-subtask-title">${formatMarkdown(subtask.title)}</span>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
                ${manualSubtasks.length > 0 ? `
                  <div class="plan-manual-section">
                    <div class="plan-manual-header">Manual Verification</div>
                    <div class="plan-subtasks">
                      ${manualSubtasks.map(subtask => `
                        <div class="plan-subtask-item interactive"
                             data-subtask-id="${escapeHtml(subtask.id)}"
                             data-feature-path="${escapeHtml(featurePath)}">
                          <span class="plan-subtask-checkbox ${subtask.completed ? 'completed' : 'pending'}">
                            ${subtask.completed ? '✓' : '○'}
                          </span>
                          <span class="plan-subtask-title">${formatMarkdown(subtask.title)}</span>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    artifactContent.innerHTML = cardsHtml;

    // Add click handlers for task headers
    artifactContent.querySelectorAll('.plan-task-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.plan-task-card');
        card.classList.toggle('expanded');
      });
    });

    // Add click handlers for interactive Manual QA subtasks
    artifactContent.querySelectorAll('.plan-subtask-item.interactive').forEach(item => {
      item.addEventListener('click', async () => {
        const subtaskId = item.dataset.subtaskId;
        const featurePath = item.dataset.featurePath;
        const checkbox = item.querySelector('.plan-subtask-checkbox');

        // Optimistic UI update
        const wasCompleted = checkbox.classList.contains('completed');
        checkbox.classList.toggle('completed');
        checkbox.classList.toggle('pending');
        checkbox.textContent = wasCompleted ? '○' : '✓';

        try {
          const res = await fetch('/api/subtask/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ featurePath, subtaskId })
          });

          if (!res.ok) {
            // Revert on error
            checkbox.classList.toggle('completed');
            checkbox.classList.toggle('pending');
            checkbox.textContent = wasCompleted ? '✓' : '○';
          }
        } catch (err) {
          // Revert on error
          checkbox.classList.toggle('completed');
          checkbox.classList.toggle('pending');
          checkbox.textContent = wasCompleted ? '✓' : '○';
          console.error('Failed to toggle subtask:', err);
        }
      });
    });
  } catch (err) {
    console.error('Failed to load plan:', err);
    artifactContent.innerHTML = '<p class="empty-state">Failed to load plan</p>';
  }
}

// Parse tasks.md content into tasks with subtasks
function parsePlanTasks(content) {
  const tasks = [];
  const lines = content.split('\n');
  let currentTask = null;

  for (const line of lines) {
    // Match task header: "## 1. Title" or "# 1. Title"
    const taskMatch = line.match(/^#+\s*(\d+)\.\s+(.+)/);
    if (taskMatch) {
      if (currentTask) {
        tasks.push(currentTask);
      }
      currentTask = {
        id: taskMatch[1],
        title: taskMatch[2].trim(),
        subtasks: []
      };
      continue;
    }

    // Match subtask: "- [x] 1.1 Title" or "- [ ] 1.1 Title"
    const subtaskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(\d+\.\d+)\s+(.+)/);
    if (subtaskMatch && currentTask) {
      currentTask.subtasks.push({
        id: subtaskMatch[2],
        title: subtaskMatch[3].trim(),
        completed: subtaskMatch[1].toLowerCase() === 'x'
      });
    }
  }

  if (currentTask) {
    tasks.push(currentTask);
  }

  return tasks;
}

// Parse design.md content into sections by H2 headers
function parseDesignSections(content) {
  const sections = [];
  const lines = content.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      // Save previous section
      if (currentSection) {
        sections.push({
          title: currentSection,
          content: currentContent.join('\n').trim()
        });
      }
      currentSection = h2Match[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection) {
    sections.push({
      title: currentSection,
      content: currentContent.join('\n').trim()
    });
  }

  return sections;
}

// Markdown renderer using marked.js
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    return marked.parse(text);
  }
  // Fallback to escaped text if marked not loaded
  return `<pre>${escapeHtml(text)}</pre>`;
}

function renderFeatureLane(feature) {
    // Group tasks by status
    const todoTasks = feature.tasks.filter(t => t.status === 'todo');
    const inProgressTasks = feature.tasks.filter(t => t.status === 'in_progress');
    const doneTasks = feature.tasks.filter(t => t.status === 'done');

    const totalSubtasks = feature.tasks.reduce((sum, t) => sum + t.subtasks.length, 0);
    const completedSubtasks = feature.tasks.reduce((sum, t) => sum + t.subtasks.filter(s => s.completed).length, 0);
    const hasSpecs = feature.specs && feature.specs.length > 0;
    const featureData = JSON.stringify(feature).replace(/'/g, "&#39;");

    return `
      <div class="feature-lane" data-feature='${featureData}'>
        <div class="lane-header">
          <div class="lane-header-left">
            <div class="lane-title-row">
              <span class="lane-title">${escapeHtml(feature.name)}</span>
              <div class="lane-badges">
                <span class="badge-link ${feature.hasProposal ? 'active' : 'disabled'}" data-artifact="proposal">Proposal</span>
                <span class="badge-link ${feature.hasDesign ? 'active' : 'disabled'}" data-artifact="design">Design</span>
                <span class="badge-link ${hasSpecs ? 'active' : 'disabled'}" data-artifact="specs">Spec</span>
                <span class="badge-link ${feature.hasPlan ? 'active' : 'disabled'}" data-artifact="plan">Plan</span>
              </div>
            </div>
            <div class="lane-worktree">
              <i data-lucide="folder-git-2" class="worktree-icon"></i>
              <span class="worktree-name">${escapeHtml(feature.worktree)}</span>
              <div class="worktree-actions">
                <button class="action-btn" data-action="finder" data-path="${escapeHtml(feature.worktreePath)}" title="Open in Finder">
                  <i data-lucide="folder-open"></i>
                </button>
                <button class="action-btn" data-action="vscode" data-path="${escapeHtml(feature.worktreePath)}" title="Open in VS Code">
                  <i data-lucide="code"></i>
                </button>
                <button class="action-btn" data-action="terminal" data-path="${escapeHtml(feature.worktreePath)}" title="Open in Terminal">
                  <i data-lucide="terminal"></i>
                </button>
              </div>
            </div>
          </div>
          <span class="lane-meta">
            ${feature.tasks.length} tasks${totalSubtasks > 0 ? ` | ${completedSubtasks}/${totalSubtasks} subtasks` : ''}
          </span>
        </div>
        <div class="kanban-board">
          <div class="kanban-column todo">
            <div class="column-header">
              <span class="column-title">Todo</span>
              <span class="column-count">${todoTasks.length}</span>
            </div>
            <div class="column-content">
              ${todoTasks.map(task => renderTaskCard(task, feature.name, feature.path)).join('')}
            </div>
          </div>
          <div class="kanban-column in-progress">
            <div class="column-header">
              <span class="column-title">In Progress</span>
              <span class="column-count">${inProgressTasks.length}</span>
            </div>
            <div class="column-content">
              ${inProgressTasks.map(task => renderTaskCard(task, feature.name, feature.path)).join('')}
            </div>
          </div>
          <div class="kanban-column done">
            <div class="column-header">
              <span class="column-title">Done</span>
              <span class="column-count">${doneTasks.length}</span>
            </div>
            <div class="column-content">
              ${doneTasks.map(task => renderTaskCard(task, feature.name, feature.path)).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
}

// Inline markdown formatter for task titles (just code and basic formatting)
function formatMarkdown(text) {
  if (typeof marked !== 'undefined') {
    // Use marked.parseInline for inline content (no block elements)
    return marked.parseInline(text);
  }
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Render a task card
function renderTaskCard(task, featureName, featurePath) {
  const completedSubtasks = task.subtasks.filter(s => s.completed).length;
  const totalSubtasks = task.subtasks.length;
  const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
  const taskData = JSON.stringify({ ...task, featureName, featurePath }).replace(/'/g, "&#39;");

  return `
    <div class="task-card ${task.status} ${totalSubtasks > 0 ? 'clickable' : ''}" ${totalSubtasks > 0 ? `data-task='${taskData}'` : ''}>
      <div class="task-header">
        <span class="task-id">${escapeHtml(task.id)}.</span>
        <span class="task-title">${formatMarkdown(task.title)}</span>
      </div>
      ${totalSubtasks > 0 ? `
        <div class="task-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="progress-text">${completedSubtasks}/${totalSubtasks}</div>
        </div>
      ` : ''}
    </div>
  `;
}

// =============================================================================
// Real-time Updates (SSE)
// =============================================================================

/** Setup Server-Sent Events for real-time updates */
function setupEventSource() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'update') {
      loadRepositories();
      if (currentRepo && !currentFeature) {
        loadFeatures(currentRepo);
      }
    }
  };

  eventSource.onerror = () => {
    updateConnectionStatus(false);
    setTimeout(setupEventSource, 5000);
  };

  eventSource.onopen = () => {
    updateConnectionStatus(true);
  };
}

// Update connection status indicator
function updateConnectionStatus(connected) {
  let status = document.querySelector('.connection-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'connection-status';
    document.body.appendChild(status);
  }

  status.innerHTML = `
    <span class="status-dot ${connected ? '' : 'disconnected'}"></span>
    ${connected ? 'Connected' : 'Reconnecting...'}
  `;
}

// =============================================================================
// Event Listeners
// =============================================================================

/** Setup all DOM event listeners */
function setupEventListeners() {
  changePathBtn.addEventListener('click', openModal);

  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalSelect.addEventListener('click', selectDirectory);

  // Sidebar close
  sidebarClose.addEventListener('click', closeSubtasksSidebar);

  // Navigation
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      switchView(view);
    });
  });

  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  repoSelect.addEventListener('change', () => {
    currentRepo = repoSelect.value;
    if (currentRepo) {
      localStorage.setItem(STORAGE_KEYS.repo, currentRepo);
      updateUrlParams({ repo: currentRepo, feature: null, tab: null });
    } else {
      localStorage.removeItem(STORAGE_KEYS.repo);
      updateUrlParams({ repo: null, feature: null, tab: null });
    }
    loadFeatures(currentRepo);
  });
}

// =============================================================================
// Utilities
// =============================================================================

/** Escape HTML special characters to prevent XSS */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Check if a subtask is a manual verification task
 * Matches: "Manual QA" prefix, "(manual)" suffix, "— manual" anywhere
 */
function isManualSubtask(title) {
  const lowerTitle = title.toLowerCase();
  return (
    title.startsWith('Manual QA') ||
    lowerTitle.includes('(manual)') ||
    lowerTitle.includes('— manual') ||
    lowerTitle.includes('- manual)')
  );
}

// Start the app
init();
