// =========================================
// 4TheNorth Admin Dashboard JS v2
// SPA-like story management
// =========================================

let currentStoryId = null;
let modalStoryId = null;
let modalStoryData = null;
let currentPage = 1;
let currentStatus = 'all';
let searchTimeout = null;
let selectedIds = new Set();

// ------- Init -------

document.addEventListener('DOMContentLoaded', () => {
  loadStories();
  document.getElementById('urlInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') processUrl();
  });
});

// ------- Section Toggle -------

function toggleSection(id) {
  const body = document.getElementById(id);
  const icon = document.getElementById(id + '-icon');
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    if (icon) icon.style.transform = 'rotate(0deg)';
  } else {
    body.classList.add('collapsed');
    if (icon) icon.style.transform = 'rotate(-90deg)';
  }
}

// ------- Toast Notifications -------

function toast(message, type = 'success', duration = 4000, undoCallback = null) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  
  let html = message;
  if (undoCallback) {
    html += `<span class="toast-undo" onclick="event.stopPropagation()">Undo</span>`;
  }
  el.innerHTML = html;
  
  if (undoCallback) {
    el.querySelector('.toast-undo').addEventListener('click', () => {
      undoCallback();
      el.remove();
    });
  }
  
  el.addEventListener('click', () => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 250);
  });
  
  container.appendChild(el);
  
  setTimeout(() => {
    if (el.parentNode) {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 250);
    }
  }, duration);
}

// ------- URL Processing -------

async function processUrl() {
  const urlInput = document.getElementById('urlInput');
  const btn = document.getElementById('processBtn');
  const status = document.getElementById('processStatus');
  const url = urlInput.value.trim();

  if (!url) {
    toast('Please paste a URL first.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Processing...';
  showStatus('<span class="spinner"></span> Scraping article and generating AI options...', 'loading');

  try {
    const res = await fetch('/admin/stories/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      showStatus(data.error || 'Processing failed.', 'error');
      btn.disabled = false;
      btn.textContent = 'Process with AI';
      return;
    }

    currentStoryId = data.story.id;
    displayAIResult(data);
    showStatus('', 'success');
    document.getElementById('processStatus').style.display = 'none';
    urlInput.value = '';
  } catch (err) {
    showStatus('Network error: ' + err.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Process with AI';
}

function displayAIResult(data) {
  const section = document.getElementById('aiResult');
  section.style.display = 'block';

  const img = document.getElementById('storyImage');
  if (data.story.imageUrl) {
    img.src = data.story.imageUrl;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
  document.getElementById('storyTitle').textContent = data.story.originalTitle;
  document.getElementById('storySource').textContent = data.story.sourceName || '';
  document.getElementById('storyDesc').textContent = data.story.originalDescription || '';

  const conf = data.ai.primary.confidence;
  const confBadge = document.getElementById('aiConfidence');
  confBadge.textContent = `Confidence: ${(conf * 100).toFixed(0)}%`;
  confBadge.className = 'confidence-badge ' + (conf >= 0.7 ? 'confidence-high' : conf >= 0.4 ? 'confidence-mid' : 'confidence-low');

  const optionsContainer = document.getElementById('aiOptions');
  const options = [
    { label: 'Primary', tag: data.ai.primary.editorialTag, commentary: data.ai.primary.commentary },
    ...(data.ai.alternatives || []).map((alt, i) => ({ label: `Option ${i + 2}`, tag: alt.editorial_tag, commentary: alt.commentary })),
  ];

  optionsContainer.innerHTML = options.map((opt, i) => `
    <div class="ai-option ${i === 0 ? 'selected' : ''}" onclick="selectOption(this, '${esc(opt.tag)}', '${esc(opt.commentary)}')">
      <div class="ai-option-label">${opt.label}</div>
      <div class="ai-option-tag">${esc(opt.tag || 'No tag')}</div>
      <div class="ai-option-commentary">${esc(opt.commentary || 'No commentary')}</div>
    </div>
  `).join('');

  document.getElementById('editTag').value = data.ai.primary.editorialTag || '';
  document.getElementById('editCommentary').value = data.ai.primary.commentary || '';
  document.getElementById('editCategory').value = data.ai.category || 'News';
  document.getElementById('editFeatured').checked = false;
  document.getElementById('editBreaking').checked = false;

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectOption(el, tag, commentary) {
  document.querySelectorAll('.ai-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('editTag').value = tag;
  document.getElementById('editCommentary').value = commentary;
}

// ------- Story Actions (from AI panel) -------

async function publishStory() {
  if (!currentStoryId) return;
  await updateStory(currentStoryId, 'published');
  toast('Story published! It\'s now live in the feed.');
  document.getElementById('aiResult').style.display = 'none';
  loadStories();
  refreshStats();
}

async function savePending() {
  if (!currentStoryId) return;
  await updateStory(currentStoryId, 'pending');
  toast('Story saved as pending.', 'info');
  document.getElementById('aiResult').style.display = 'none';
  loadStories();
  refreshStats();
}

async function rejectStory() {
  if (!currentStoryId) return;
  await updateStory(currentStoryId, 'rejected');
  toast('Story rejected.', 'info');
  document.getElementById('aiResult').style.display = 'none';
  loadStories();
  refreshStats();
}

async function regenerateAI() {
  if (!currentStoryId) return;
  toast('Regenerating AI options...', 'info', 2000);

  try {
    const res = await fetch(`/admin/stories/${currentStoryId}/regenerate`, { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      const optionsContainer = document.getElementById('aiOptions');
      const options = [
        { label: 'Primary', tag: data.primary.editorialTag, commentary: data.primary.commentary },
        ...(data.alternatives || []).map((alt, i) => ({ label: `Option ${i + 2}`, tag: alt.editorial_tag, commentary: alt.commentary })),
      ];

      optionsContainer.innerHTML = options.map((opt, i) => `
        <div class="ai-option ${i === 0 ? 'selected' : ''}" onclick="selectOption(this, '${esc(opt.tag)}', '${esc(opt.commentary)}')">
          <div class="ai-option-label">${opt.label}</div>
          <div class="ai-option-tag">${esc(opt.tag || 'No tag')}</div>
          <div class="ai-option-commentary">${esc(opt.commentary || 'No commentary')}</div>
        </div>
      `).join('');

      document.getElementById('editTag').value = data.primary.editorialTag || '';
      document.getElementById('editCommentary').value = data.primary.commentary || '';
      document.getElementById('editCategory').value = data.category || 'News';

      const conf = data.primary.confidence;
      const confBadge = document.getElementById('aiConfidence');
      confBadge.textContent = `Confidence: ${(conf * 100).toFixed(0)}%`;
      confBadge.className = 'confidence-badge ' + (conf >= 0.7 ? 'confidence-high' : conf >= 0.4 ? 'confidence-mid' : 'confidence-low');

      toast('New AI options generated!');
    } else {
      toast(data.error || 'Regeneration failed.', 'error');
    }
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
  }
}

async function updateStory(id, status) {
  const body = { status };
  
  // If updating from AI panel, include edit fields
  const tagEl = document.getElementById('editTag');
  if (tagEl && tagEl.value) {
    body.editorialTag = tagEl.value;
    body.commentary = document.getElementById('editCommentary').value;
    body.category = document.getElementById('editCategory').value;
    body.isFeatured = document.getElementById('editFeatured').checked;
    body.isBreaking = document.getElementById('editBreaking').checked;
  }

  await fetch(`/admin/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ------- Story List (SPA-like) -------

async function loadStories() {
  const queue = document.getElementById('storyQueue');
  queue.innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading stories...</div>';

  const search = document.getElementById('searchInput').value.trim();
  const category = document.getElementById('categoryFilter').value;
  const sort = document.getElementById('sortSelect').value;

  const params = new URLSearchParams({
    status: currentStatus,
    page: currentPage,
    limit: 20,
    search,
    category,
    sort,
  });

  try {
    const res = await fetch(`/admin/stories?${params}`);
    const data = await res.json();

    if (!data.stories || data.stories.length === 0) {
      queue.innerHTML = '<div class="empty-state">No stories found.</div>';
      document.getElementById('pagination').style.display = 'none';
      return;
    }

    queue.innerHTML = data.stories.map(story => renderCard(story)).join('');

    // Pagination
    const pag = document.getElementById('pagination');
    if (data.totalPages > 1) {
      pag.style.display = 'flex';
      document.getElementById('pageInfo').textContent = `Page ${data.page} of ${data.totalPages} (${data.total} stories)`;
      document.getElementById('prevPage').disabled = data.page <= 1;
      document.getElementById('nextPage').disabled = data.page >= data.totalPages;
    } else {
      pag.style.display = data.total > 0 ? 'flex' : 'none';
      document.getElementById('pageInfo').textContent = `${data.total} stories`;
      document.getElementById('prevPage').disabled = true;
      document.getElementById('nextPage').disabled = true;
    }

    // Restore selections
    selectedIds.forEach(id => {
      const card = document.querySelector(`[data-id="${id}"]`);
      if (card) {
        card.classList.add('selected-card');
        const cb = card.querySelector('.queue-card-check');
        if (cb) cb.checked = true;
      }
    });

  } catch (err) {
    queue.innerHTML = '<div class="empty-state">Failed to load stories.</div>';
    console.error('Load stories error:', err);
  }
}

function renderCard(story) {
  const dateStr = story.createdAt ? new Date(story.createdAt).toLocaleDateString('en-CA') : '';
  const timeStr = story.createdAt ? new Date(story.createdAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }) : '';
  const checked = selectedIds.has(story.id) ? 'checked' : '';
  const selectedClass = selectedIds.has(story.id) ? 'selected-card' : '';

  return `
    <div class="queue-card ${selectedClass}" data-id="${story.id}" data-status="${story.status}">
      <input type="checkbox" class="queue-card-check" ${checked}
        onclick="event.stopPropagation(); toggleSelect('${story.id}', this)"
      >
      <div class="queue-card-content" onclick="openEditModal('${story.id}')">
        <div class="queue-card-top">
          ${story.editorialTag ? `<span class="tag">${esc(story.editorialTag)}</span>` : ''}
          <span class="status status-${story.status}">${story.status}</span>
          ${story.category ? `<span class="category-badge">${esc(story.category)}</span>` : ''}
          ${story.isFeatured ? '<span class="tag" style="color:#f59e0b;background:rgba(245,158,11,0.1);">Featured</span>' : ''}
          ${story.isBreaking ? '<span class="tag" style="color:#ef4444;background:rgba(239,68,68,0.1);">Breaking</span>' : ''}
        </div>
        <div class="queue-card-title">${esc(story.originalTitle)}</div>
        ${story.commentary ? `<div class="queue-card-commentary">Translation: ${esc(story.commentary)}</div>` : ''}
        <div class="queue-card-meta">
          <span>${esc(story.sourceName || 'Unknown')}</span>
          <span>${dateStr} ${timeStr}</span>
        </div>
      </div>
      <div class="queue-card-actions" onclick="event.stopPropagation()">
        <button class="btn-sm btn-edit" onclick="openEditModal('${story.id}')" title="Edit">Edit</button>
        ${story.status !== 'published' ? `<button class="btn-sm btn-publish" onclick="quickAction('${story.id}', 'published')">Publish</button>` : ''}
        ${story.status === 'published' ? `<button class="btn-sm btn-secondary" onclick="quickAction('${story.id}', 'pending')">Unpublish</button>` : ''}
      </div>
    </div>
  `;
}

// ------- Quick Actions (from queue) -------

async function quickAction(id, newStatus) {
  const previousStatus = document.querySelector(`[data-id="${id}"]`)?.dataset.status;
  
  await fetch(`/admin/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });

  const label = newStatus === 'published' ? 'Published' : newStatus === 'pending' ? 'Unpublished' : 'Rejected';
  toast(`${label} successfully.`, 'success', 5000, async () => {
    // Undo
    await fetch(`/admin/stories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: previousStatus || 'pending' }),
    });
    toast('Action undone.', 'info');
    loadStories();
    refreshStats();
  });

  loadStories();
  refreshStats();
}

// ------- Selection & Bulk Actions -------

function toggleSelect(id, checkbox) {
  if (checkbox.checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }
  
  const card = checkbox.closest('.queue-card');
  if (card) card.classList.toggle('selected-card', checkbox.checked);
  
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const count = document.getElementById('bulkCount');
  
  if (selectedIds.size > 0) {
    bar.style.display = 'flex';
    count.textContent = `${selectedIds.size} selected`;
  } else {
    bar.style.display = 'none';
  }
}

function clearSelection() {
  selectedIds.clear();
  document.querySelectorAll('.queue-card-check').forEach(cb => cb.checked = false);
  document.querySelectorAll('.queue-card').forEach(c => c.classList.remove('selected-card'));
  updateBulkBar();
}

async function bulkAction(action) {
  if (selectedIds.size === 0) return;
  
  const ids = Array.from(selectedIds);
  const count = ids.length;
  
  if (action === 'delete') {
    if (!confirm(`Permanently delete ${count} stories? This cannot be undone.`)) return;
  }

  try {
    const res = await fetch('/admin/stories/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action }),
    });

    const data = await res.json();
    if (data.success) {
      const label = action === 'publish' ? 'published' : action === 'unpublish' ? 'unpublished' : action === 'reject' ? 'rejected' : 'deleted';
      toast(`${data.affected} stories ${label}.`);
      clearSelection();
      loadStories();
      refreshStats();
    } else {
      toast(data.error || 'Bulk action failed.', 'error');
    }
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
  }
}

// ------- Edit Modal -------

async function openEditModal(id) {
  modalStoryId = id;
  
  try {
    const res = await fetch(`/admin/stories/${id}`);
    const data = await res.json();
    
    if (!data.story) {
      toast('Story not found.', 'error');
      return;
    }

    modalStoryData = data.story;
    const s = data.story;

    // Meta info
    const metaEl = document.getElementById('modalMeta');
    const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString('en-CA') : '';
    metaEl.innerHTML = `
      ${s.imageUrl ? `<img src="${s.imageUrl}" class="modal-meta-thumb" alt="">` : ''}
      <div class="modal-meta-info">
        <div class="modal-meta-source">${esc(s.sourceName || 'Unknown')}</div>
        ${s.sourceUrl ? `<div class="modal-meta-url"><a href="${s.sourceUrl}" target="_blank" style="color:#60a5fa;text-decoration:none;">${s.sourceUrl}</a></div>` : ''}
        <div class="modal-meta-date">Created: ${dateStr}</div>
      </div>
    `;

    // Fill fields
    document.getElementById('modalTitle').value = s.originalTitle || '';
    document.getElementById('modalTag').value = s.editorialTag || '';
    document.getElementById('modalCommentary').value = s.commentary || '';
    document.getElementById('modalCategory').value = s.category || 'News';
    document.getElementById('modalStatus').value = s.status || 'pending';
    document.getElementById('modalFeatured').checked = s.isFeatured || false;
    document.getElementById('modalBreaking').checked = s.isBreaking || false;

    document.getElementById('editModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Focus first field
    setTimeout(() => document.getElementById('modalTag').focus(), 200);
  } catch (err) {
    toast('Failed to load story details.', 'error');
  }
}

function closeModal() {
  document.getElementById('editModal').style.display = 'none';
  document.body.style.overflow = '';
  modalStoryId = null;
  modalStoryData = null;
}

function closeModalOnOverlay(e) {
  if (e.target === e.currentTarget) closeModal();
}

async function saveModal() {
  if (!modalStoryId) return;

  const body = {
    originalTitle: document.getElementById('modalTitle').value,
    editorialTag: document.getElementById('modalTag').value,
    commentary: document.getElementById('modalCommentary').value,
    category: document.getElementById('modalCategory').value,
    status: document.getElementById('modalStatus').value,
    isFeatured: document.getElementById('modalFeatured').checked,
    isBreaking: document.getElementById('modalBreaking').checked,
  };

  try {
    const res = await fetch(`/admin/stories/${modalStoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      toast('Story updated.');
      closeModal();
      loadStories();
      refreshStats();
    } else {
      const data = await res.json();
      toast(data.error || 'Update failed.', 'error');
    }
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
  }
}

async function modalRegenerate() {
  if (!modalStoryId) return;
  toast('Regenerating AI...', 'info', 2000);

  try {
    const res = await fetch(`/admin/stories/${modalStoryId}/regenerate`, { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      document.getElementById('modalTag').value = data.primary.editorialTag || '';
      document.getElementById('modalCommentary').value = data.primary.commentary || '';
      document.getElementById('modalCategory').value = data.category || 'News';
      toast('AI regenerated! Review the new values and save.');
    } else {
      toast(data.error || 'Regeneration failed.', 'error');
    }
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
  }
}

async function modalDelete() {
  if (!modalStoryId) return;
  if (!confirm('Permanently delete this story? This cannot be undone.')) return;

  try {
    const res = await fetch(`/admin/stories/${modalStoryId}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Story deleted.');
      closeModal();
      loadStories();
      refreshStats();
    } else {
      toast('Delete failed.', 'error');
    }
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
  }
}

// ------- Filtering & Search -------

function setStatusFilter(status, btn) {
  currentStatus = status;
  currentPage = 1;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  loadStories();
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage = 1;
    loadStories();
  }, 300);
}

function changePage(delta) {
  currentPage += delta;
  if (currentPage < 1) currentPage = 1;
  loadStories();
  // Scroll to queue
  document.getElementById('storyQueue').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ------- Stats Refresh -------

async function refreshStats() {
  try {
    const res = await fetch('/admin/stats');
    const data = await res.json();
    const el1 = document.getElementById('statPublished');
    const el2 = document.getElementById('statPending');
    if (el1) el1.textContent = data.publishedToday || 0;
    if (el2) el2.textContent = data.pending || 0;
  } catch (e) {
    // silently fail
  }
}

// ------- Keyboard Shortcuts -------

document.addEventListener('keydown', (e) => {
  // Escape closes modal
  if (e.key === 'Escape') {
    const modal = document.getElementById('editModal');
    if (modal.style.display !== 'none') {
      closeModal();
    }
  }
  // Cmd+K focuses search
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }
});

// ------- Utilities -------

function showStatus(msg, type) {
  const el = document.getElementById('processStatus');
  el.innerHTML = msg;
  el.className = 'status-msg ' + type;
  el.style.display = msg ? 'block' : 'none';
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
