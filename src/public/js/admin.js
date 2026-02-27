let currentStoryId = null, modalStoryId = null, currentPage = 1, currentStatus = 'all', currentView = 'list', searchTimeout = null, selectedIds = new Set();

document.addEventListener('DOMContentLoaded', () => {
  loadStories();
  document.getElementById('urlInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') processUrl(); });
  document.getElementById('globalSearchInput')?.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { currentPage = 1; loadStories(); }, 280); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const m = document.getElementById('editModal'); if (m.style.display !== 'none') closeModal(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('globalSearchInput')?.focus(); }
});

function setView(v) { currentView = v; document.getElementById('storyQueue').className = 'story-list' + (v === 'grid' ? ' grid-view' : ''); document.getElementById('viewList').classList.toggle('active', v === 'list'); document.getElementById('viewGrid').classList.toggle('active', v === 'grid'); loadStories(); }

function toast(msg, type='success', duration=4000, undoFn=null) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = msg + (undoFn ? '<span class="toast-undo">Undo</span>' : '');
  if (undoFn) el.querySelector('.toast-undo').onclick = e => { e.stopPropagation(); undoFn(); el.remove(); };
  el.onclick = () => { el.classList.add('removing'); setTimeout(() => el.remove(), 220); };
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => { if (el.parentNode) { el.classList.add('removing'); setTimeout(() => el.remove(), 220); } }, duration);
}

function updateCounter(iId, cId) { const el = document.getElementById(iId), c = document.getElementById(cId); if (el && c) c.textContent = el.value.length; }

function showProcessStatus(msg, type) { const el = document.getElementById('processStatus'); el.innerHTML = msg; el.className = 'process-status ' + type; el.style.display = 'block'; }
function hideProcessStatus() { document.getElementById('processStatus').style.display = 'none'; }
function closeAiPanel() { document.getElementById('aiResult').style.display = 'none'; currentStoryId = null; }

async function processUrl() {
  const urlInput = document.getElementById('urlInput'), btn = document.getElementById('processBtn'), url = urlInput.value.trim();
  if (!url) { toast('Paste a URL first.', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Processing…';
  showProcessStatus('Scraping article and generating AI options…', 'loading');
  try {
    const res = await fetch('/admin/stories/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    const data = await res.json();
    if (!res.ok) { showProcessStatus(data.error || 'Processing failed.', 'error'); return; }
    currentStoryId = data.story.id;
    displayAIResult(data);
    hideProcessStatus();
    urlInput.value = '';
  } catch (err) { showProcessStatus('Network error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Process with AI'; }
}

function displayAIResult(data) {
  const panel = document.getElementById('aiResult');
  panel.style.display = 'block';
  const img = document.getElementById('storyImage');
  if (data.story.imageUrl) { img.src = data.story.imageUrl; img.style.display = 'block'; } else { img.style.display = 'none'; }
  document.getElementById('storyTitle').textContent = data.story.originalTitle || '';
  document.getElementById('storySource').textContent = data.story.sourceName || '';
  document.getElementById('storyDesc').textContent = data.story.originalDescription || '';
  const conf = data.ai.primary.confidence || 0;
  const badge = document.getElementById('aiConfidence');
  badge.textContent = `${(conf * 100).toFixed(0)}% confidence`;
  badge.className = 'confidence-pill ' + (conf >= 0.7 ? 'conf-high' : conf >= 0.4 ? 'conf-mid' : 'conf-low');
  const opts = [{ label: 'Primary', tag: data.ai.primary.editorialTag, commentary: data.ai.primary.commentary }, ...(data.ai.alternatives || []).map((a, i) => ({ label: `Option ${i+2}`, tag: a.editorial_tag, commentary: a.commentary }))];
  document.getElementById('aiOptions').innerHTML = opts.map((o, i) => `<div class="ai-option${i===0?' selected':''}" onclick="selectAIOption(this,'${esc(o.tag)}','${esc(o.commentary)}')"><div class="ai-opt-label">${o.label}</div><div class="ai-opt-tag">${esc(o.tag||'—')}</div><div class="ai-opt-commentary">${esc(o.commentary||'—')}</div></div>`).join('');
  document.getElementById('editTag').value = data.ai.primary.editorialTag || '';
  document.getElementById('editCommentary').value = data.ai.primary.commentary || '';
  updateCounter('editCommentary', 'commentaryCount');
  document.getElementById('editCategory').value = data.ai.category || 'News';
  document.getElementById('editFeatured').checked = false;
  document.getElementById('editBreaking').checked = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectAIOption(el, tag, commentary) { document.querySelectorAll('.ai-option').forEach(o => o.classList.remove('selected')); el.classList.add('selected'); document.getElementById('editTag').value = tag; document.getElementById('editCommentary').value = commentary; updateCounter('editCommentary', 'commentaryCount'); }

async function updateStoryFromPanel(id, status) {
  await fetch(`/admin/stories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, editorialTag: document.getElementById('editTag').value, commentary: document.getElementById('editCommentary').value, category: document.getElementById('editCategory').value, isFeatured: document.getElementById('editFeatured').checked, isBreaking: document.getElementById('editBreaking').checked }) });
}

async function publishStory() { if (!currentStoryId) return; await updateStoryFromPanel(currentStoryId, 'published'); toast('Story published! 🎉'); closeAiPanel(); loadStories(); refreshStats(); }
async function savePending() { if (!currentStoryId) return; await updateStoryFromPanel(currentStoryId, 'pending'); toast('Saved as pending.', 'info'); closeAiPanel(); loadStories(); refreshStats(); }
async function rejectStory() { if (!currentStoryId) return; await updateStoryFromPanel(currentStoryId, 'rejected'); toast('Story rejected.', 'info'); closeAiPanel(); loadStories(); refreshStats(); }

async function regenerateAI() {
  if (!currentStoryId) return;
  toast('Regenerating…', 'info', 2500);
  try {
    const res = await fetch(`/admin/stories/${currentStoryId}/regenerate`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      const opts = [{ label: 'Primary', tag: data.primary.editorialTag, commentary: data.primary.commentary }, ...(data.alternatives || []).map((a, i) => ({ label: `Option ${i+2}`, tag: a.editorial_tag, commentary: a.commentary }))];
      document.getElementById('aiOptions').innerHTML = opts.map((o, i) => `<div class="ai-option${i===0?' selected':''}" onclick="selectAIOption(this,'${esc(o.tag)}','${esc(o.commentary)}')"><div class="ai-opt-label">${o.label}</div><div class="ai-opt-tag">${esc(o.tag||'—')}</div><div class="ai-opt-commentary">${esc(o.commentary||'—')}</div></div>`).join('');
      document.getElementById('editTag').value = data.primary.editorialTag || '';
      document.getElementById('editCommentary').value = data.primary.commentary || '';
      updateCounter('editCommentary', 'commentaryCount');
      document.getElementById('editCategory').value = data.category || 'News';
      toast('New AI options ready!');
    } else { toast(data.error || 'Failed.', 'error'); }
  } catch (e) { toast('Network error.', 'error'); }
}

async function loadStories() {
  const queue = document.getElementById('storyQueue');
  queue.innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading…</div>';
  const search = document.getElementById('globalSearchInput')?.value.trim() || '';
  const params = new URLSearchParams({ status: currentStatus, page: currentPage, limit: 25, search, category: document.getElementById('categoryFilter').value, sort: document.getElementById('sortSelect').value });
  try {
    const res = await fetch(`/admin/stories?${params}`);
    const data = await res.json();
    const countEl = document.getElementById('storiesCount');
    if (countEl) countEl.textContent = data.total ? `(${data.total})` : '';
    if (!data.stories || data.stories.length === 0) { queue.innerHTML = '<div class="empty-state">No stories found.</div>'; document.getElementById('pagination').style.display = 'none'; return; }
    queue.className = 'story-list' + (currentView === 'grid' ? ' grid-view' : '');
    queue.innerHTML = data.stories.map(s => renderCard(s)).join('');
    selectedIds.forEach(id => { const card = document.querySelector(`[data-id="${id}"]`); if (card) { card.classList.add('selected-card'); const cb = card.querySelector('.story-card-check'); if (cb) cb.checked = true; } });
    const pag = document.getElementById('pagination'), pageInfo = document.getElementById('pageInfo');
    if (data.totalPages > 1) { pag.style.display = 'flex'; pageInfo.textContent = `Page ${data.page} of ${data.totalPages} · ${data.total} stories`; document.getElementById('prevPage').disabled = data.page <= 1; document.getElementById('nextPage').disabled = data.page >= data.totalPages; }
    else { pag.style.display = data.total > 20 ? 'flex' : 'none'; pageInfo.textContent = `${data.total} stories`; document.getElementById('prevPage').disabled = true; document.getElementById('nextPage').disabled = true; }
  } catch (e) { queue.innerHTML = '<div class="empty-state">Failed to load stories.</div>'; }
}

function renderCard(s) {
  const date = s.publishedAt ? new Date(s.publishedAt).toLocaleDateString('en-CA', {month:'short',day:'numeric',year:'numeric'}) : s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-CA', {month:'short',day:'numeric'}) : '';
  const time = s.createdAt ? new Date(s.createdAt).toLocaleTimeString('en-CA', {hour:'2-digit',minute:'2-digit'}) : '';
  const sc = s.status==='published'?'sp-published':s.status==='pending'?'sp-pending':'sp-rejected';
  const publishBtn = s.status !== 'published' ? `<button class="action-btn action-publish" onclick="event.stopPropagation();quickAction('${s.id}','published')">Publish</button>` : `<button class="action-btn action-unpublish" onclick="event.stopPropagation();quickAction('${s.id}','pending')">Unpublish</button>`;
  return `<div class="story-card status-${s.status}" data-id="${s.id}" data-status="${s.status}" onclick="openEditModal('${s.id}')">
    <input type="checkbox" class="story-card-check" onclick="event.stopPropagation();toggleSelect('${s.id}',this)" ${selectedIds.has(s.id)?'checked':''}>
    <div class="story-card-body">
      <div class="story-card-top">
        ${s.editorialTag?`<span class="tag-pill">${esc(s.editorialTag)}</span>`:''}
        <span class="status-pill ${sc}">${s.status}</span>
        ${s.category?`<span class="cat-pill">${esc(s.category)}</span>`:''}
        ${s.isFeatured?'<span class="flag-pill flag-featured">★ Featured</span>':''}
        ${s.isBreaking?'<span class="flag-pill flag-breaking">🔴 Breaking</span>':''}
      </div>
      <div class="story-card-title">${esc(s.originalTitle||'Untitled')}</div>
      ${s.commentary?`<div class="story-card-commentary">${esc(s.commentary)}</div>`:''}
      <div class="story-card-meta"><span>${esc(s.sourceName||'Unknown')}</span><span>${date}${time?' · '+time:''}</span></div>
      <div class="story-card-stats">
        <span class="stat-chip">👁 ${s.views||0}</span>
        <span class="stat-chip">👍 ${s.likes||0}</span>
        <span class="stat-chip stat-viral">🔥 ${parseFloat(s.viralScore||0).toFixed(1)}</span>
      </div>
    </div>
    <div class="story-card-actions">
      <button class="action-btn action-edit" onclick="event.stopPropagation();openEditModal('${s.id}')">Edit</button>
      ${publishBtn}
    </div>
  </div>`;
}

async function quickAction(id, newStatus) {
  const prev = document.querySelector(`[data-id="${id}"]`)?.dataset.status;
  try {
    await fetch(`/admin/stories/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status: newStatus}) });
    toast(newStatus==='published'?'Published ✓':'Unpublished', 'success', 5000, async () => { await fetch(`/admin/stories/${id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:prev||'pending'})}); toast('Undone.','info'); loadStories(); refreshStats(); });
    loadStories(); refreshStats();
  } catch (e) { toast('Failed.', 'error'); }
}

function toggleSelect(id, cb) { if (cb.checked) selectedIds.add(id); else selectedIds.delete(id); cb.closest('.story-card')?.classList.toggle('selected-card', cb.checked); updateBulkBar(); }
function updateBulkBar() { const bar = document.getElementById('bulkBar'), count = document.getElementById('bulkCount'); bar.style.display = selectedIds.size > 0 ? 'flex' : 'none'; if (count) count.textContent = `${selectedIds.size} selected`; }
function clearSelection() { selectedIds.clear(); document.querySelectorAll('.story-card-check').forEach(cb => cb.checked = false); document.querySelectorAll('.story-card').forEach(c => c.classList.remove('selected-card')); updateBulkBar(); }

async function bulkAction(action) {
  if (selectedIds.size === 0) return;
  const ids = Array.from(selectedIds);
  if (action === 'delete' && !confirm(`Permanently delete ${ids.length} stories?`)) return;
  try {
    const res = await fetch('/admin/stories/bulk', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ids, action}) });
    const data = await res.json();
    if (data.success) { toast(`${data.affected} stories ${action}ed.`); clearSelection(); loadStories(); refreshStats(); }
    else { toast(data.error || 'Failed.', 'error'); }
  } catch (e) { toast('Network error.', 'error'); }
}

function setStatusFilter(status, btn) { currentStatus = status; currentPage = 1; document.querySelectorAll('.sidebar-filter').forEach(f => f.classList.remove('active')); btn.classList.add('active'); loadStories(); }
function changePage(delta) { currentPage += delta; if (currentPage < 1) currentPage = 1; loadStories(); document.getElementById('storyQueue')?.scrollIntoView({behavior:'smooth',block:'start'}); }

async function refreshStats() {
  try {
    const d = await (await fetch('/admin/stats')).json();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
    set('statPublishedToday', d.publishedToday); set('navPublished', d.publishedToday);
    set('statPending', d.pendingCount || d.pending); set('navPending', d.pendingCount || d.pending);
    set('statTotal', d.totalStories || (d.published||0)+(d.pending||0)+(d.rejected||0));
    set('statSubs', d.subscribers);
  } catch (e) {}
}

async function openEditModal(id) {
  modalStoryId = id;
  try {
    const res = await fetch(`/admin/stories/${id}`);
    const data = await res.json();
    if (!data.story) { toast('Story not found.', 'error'); return; }
    const s = data.story;
    const badge = document.getElementById('modalStatusBadge');
    badge.textContent = s.status; badge.className = 'modal-status-badge msb-' + s.status;
    const srcLink = document.getElementById('modalSourceLink');
    if (s.sourceUrl) { srcLink.href = s.sourceUrl; srcLink.style.display = 'flex'; } else { srcLink.style.display = 'none'; }
    const imgRow = document.getElementById('modalImageRow');
    if (s.imageUrl) { document.getElementById('modalThumb').src = s.imageUrl; imgRow.style.display = 'flex'; } else { imgRow.style.display = 'none'; }
    document.getElementById('modalSourceName').textContent = s.sourceName || 'Unknown';
    document.getElementById('modalCreatedAt').textContent = s.createdAt ? 'Added ' + new Date(s.createdAt).toLocaleString('en-CA', {dateStyle:'medium',timeStyle:'short'}) : '';
    const pubEl = document.getElementById('modalPublishedAt');
    if (s.publishedAt) { pubEl.textContent = 'Published ' + new Date(s.publishedAt).toLocaleString('en-CA', {dateStyle:'medium',timeStyle:'short'}); pubEl.style.display = 'block'; } else { pubEl.style.display = 'none'; }
    document.getElementById('modalTitle').value = s.originalTitle || '';
    document.getElementById('modalTag').value = s.editorialTag || '';
    document.getElementById('modalCommentary').value = s.commentary || '';
    updateCounter('modalCommentary', 'modalCommentaryCount');
    document.getElementById('modalCategory').value = s.category || 'News';
    document.getElementById('modalFeatured').checked = s.isFeatured || false;
    document.getElementById('modalBreaking').checked = s.isBreaking || false;
    document.getElementById('modalCardStyle').value = s.cardStyle || '';
    setSelectedTags(s.tags || []);
    setModalStatus(s.status, document.querySelector(`.status-option[data-val="${s.status}"]`));
    document.getElementById('editModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('modalTag')?.focus(), 150);
  } catch (e) { toast('Failed to load story.', 'error'); }
}

function setModalStatus(val, btn) {
  document.getElementById('modalStatus').value = val;
  document.querySelectorAll('.status-option').forEach(b => { b.className = 'status-option'; if (b.dataset.val === val) b.classList.add('active-' + val); });
  const badge = document.getElementById('modalStatusBadge');
  if (badge) { badge.textContent = val; badge.className = 'modal-status-badge msb-' + val; }
}

function toggleTag(el) {
  el.classList.toggle('active');
}

function getSelectedTags() {
  return Array.from(document.querySelectorAll('#modalTags .modal-tag.active')).map(el => el.dataset.tag);
}

function setSelectedTags(tags) {
  document.querySelectorAll('#modalTags .modal-tag').forEach(el => {
    el.classList.toggle('active', tags.includes(el.dataset.tag));
  });
}

function closeModal() { document.getElementById('editModal').style.display = 'none'; document.body.style.overflow = ''; modalStoryId = null; }
function closeModalOnOverlay(e) { if (e.target === e.currentTarget) closeModal(); }

async function saveModal() {
  if (!modalStoryId) return;
  try {
    const res = await fetch(`/admin/stories/${modalStoryId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ originalTitle: document.getElementById('modalTitle').value, editorialTag: document.getElementById('modalTag').value, commentary: document.getElementById('modalCommentary').value, category: document.getElementById('modalCategory').value, status: document.getElementById('modalStatus').value, isFeatured: document.getElementById('modalFeatured').checked, isBreaking: document.getElementById('modalBreaking').checked, cardStyle: document.getElementById('modalCardStyle').value, tags: getSelectedTags() }) });
    if (res.ok) { toast('Story saved ✓'); closeModal(); loadStories(); refreshStats(); }
    else { const d = await res.json(); toast(d.error || 'Save failed.', 'error'); }
  } catch (e) { toast('Network error.', 'error'); }
}

async function modalRegenerate() {
  if (!modalStoryId) return;
  const btn = document.querySelector('.btn-regen');
  if (btn) { btn.textContent = '↻ Running…'; btn.disabled = true; }
  try {
    const res = await fetch(`/admin/stories/${modalStoryId}/regenerate`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) { document.getElementById('modalTag').value = d.primary.editorialTag || ''; document.getElementById('modalCommentary').value = d.primary.commentary || ''; updateCounter('modalCommentary','modalCommentaryCount'); document.getElementById('modalCategory').value = d.category || 'News'; toast('AI regenerated! Review and save.'); }
    else { toast(d.error || 'Failed.', 'error'); }
  } catch (e) { toast('Network error.', 'error'); }
  finally { if (btn) { btn.textContent = '↻ Run AI'; btn.disabled = false; } }
}

async function modalDelete() {
  if (!modalStoryId) return;
  if (!confirm('Permanently delete this story?')) return;
  try {
    const res = await fetch(`/admin/stories/${modalStoryId}`, { method: 'DELETE' });
    if (res.ok) { toast('Deleted.', 'info'); closeModal(); loadStories(); refreshStats(); }
    else { toast('Delete failed.', 'error'); }
  } catch (e) { toast('Network error.', 'error'); }
}

function esc(str) { if (!str) return ''; return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
