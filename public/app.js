// State
let currentRepo = null;
let currentView = 'live';
let currentFeature = null;
let featuresData = [];
let eventSource = null;
let browsingPath = '/';

// DOM Elements
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
  rootPath: 'conductor_rootPath',
  repo: 'conductor_repo'
};

// Initialize
async function init() {
  await loadConfig();
  await loadRepositories();

  // Restore last selected repo
  const savedRepo = localStorage.getItem(STORAGE_KEYS.repo);
  if (savedRepo && repoSelect.querySelector(`option[value="${savedRepo}"]`)) {
    currentRepo = savedRepo;
    repoSelect.value = savedRepo;
    loadFeatures(currentRepo);
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

// Directory browser
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

// Load repositories
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

// Render features as swimlanes with kanban columns
function renderFeatures(features) {
  // Filter out archived features
  const activeFeatures = features.filter(f => !f.isArchived);

  if (activeFeatures.length === 0) {
    swimlanes.innerHTML = '<p class="empty-state">No features found in this repository</p>';
    return;
  }

  swimlanes.innerHTML = activeFeatures.map(feature => renderFeatureLane(feature)).join('');

  // Add click handlers for open folder buttons
  swimlanes.querySelectorAll('.open-folder-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      try {
        await fetch('/api/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
      } catch (err) {
        console.error('Failed to open folder:', err);
      }
    });
  });

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
  sidebarSubtasks.innerHTML = task.subtasks.map(subtask => `
    <div class="sidebar-subtask-item">
      <span class="subtask-checkbox ${subtask.completed ? 'completed' : 'pending'}">
        ${subtask.completed ? '✓' : '○'}
      </span>
      <span class="subtask-title">${formatMarkdown(subtask.title)}</span>
    </div>
  `).join('');
  subtasksSidebar.classList.remove('hidden');
}

function closeSubtasksSidebar() {
  subtasksSidebar.classList.add('hidden');
}

// View switching
function switchView(view) {
  currentView = view;
  currentFeature = null;

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

// Render features list (card-based)
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
          <button class="open-folder-btn" data-path="${escapeHtml(feature.worktreePath)}" title="Open worktree folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <span class="worktree-name">${escapeHtml(feature.worktree)}</span>
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

  featuresList.querySelectorAll('.open-folder-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      try {
        await fetch('/api/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
      } catch (err) {
        console.error('Failed to open folder:', err);
      }
    });
  });
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
  });

  // Render header
  featureDetailHeader.innerHTML = `
    <h2>${escapeHtml(feature.name)}</h2>
    <span class="feature-detail-worktree">${escapeHtml(feature.worktree)}</span>
  `;

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

      if (tab.dataset.artifact === 'specs') {
        renderSpecsTab(feature);
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

  if (tabToShow) {
    artifactTabs.querySelector(`[data-artifact="${tabToShow.id}"]`).classList.add('active');
    if (tabToShow.id === 'specs') {
      renderSpecsTab(feature);
    } else {
      loadArtifact(feature.path, tabToShow.id);
    }
  } else {
    artifactContent.innerHTML = '<p class="empty-state">No artifacts available for this feature</p>';
  }
}

// Render specs tab with collapsible accordion sections
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
          <div class="lane-title-row">
            <span class="lane-title">${escapeHtml(feature.name)}</span>
            <button class="open-folder-btn" data-path="${escapeHtml(feature.path)}" title="Open in Finder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            <div class="lane-badges">
              <span class="badge-link ${feature.hasProposal ? 'active' : 'disabled'}" data-artifact="proposal">Proposal</span>
              <span class="badge-link ${hasSpecs ? 'active' : 'disabled'}" data-artifact="specs">Spec</span>
              <span class="badge-link ${feature.hasDesign ? 'active' : 'disabled'}" data-artifact="design">Design</span>
              <span class="badge-link ${feature.hasPlan ? 'active' : 'disabled'}" data-artifact="plan">Plan</span>
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
              ${todoTasks.map(task => renderTaskCard(task, feature.name)).join('')}
            </div>
          </div>
          <div class="kanban-column in-progress">
            <div class="column-header">
              <span class="column-title">In Progress</span>
              <span class="column-count">${inProgressTasks.length}</span>
            </div>
            <div class="column-content">
              ${inProgressTasks.map(task => renderTaskCard(task, feature.name)).join('')}
            </div>
          </div>
          <div class="kanban-column done">
            <div class="column-header">
              <span class="column-title">Done</span>
              <span class="column-count">${doneTasks.length}</span>
            </div>
            <div class="column-content">
              ${doneTasks.map(task => renderTaskCard(task, feature.name)).join('')}
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
function renderTaskCard(task, featureName) {
  const completedSubtasks = task.subtasks.filter(s => s.completed).length;
  const totalSubtasks = task.subtasks.length;
  const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
  const taskData = JSON.stringify({ ...task, featureName }).replace(/'/g, "&#39;");

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

// Setup SSE for real-time updates
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

// Setup event listeners
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
    } else {
      localStorage.removeItem(STORAGE_KEYS.repo);
    }
    loadFeatures(currentRepo);
  });
}

// Utility: escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start the app
init();
