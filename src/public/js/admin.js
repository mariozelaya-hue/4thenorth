// =========================================
// 4TheNorth Admin Dashboard JS
// =========================================

let currentStoryId = null;

// ------- URL Processing -------

async function processUrl() {
  const urlInput = document.getElementById('urlInput');
  const btn = document.getElementById('processBtn');
  const status = document.getElementById('processStatus');
  const url = urlInput.value.trim();

  if (!url) {
    showStatus('Please paste a URL first.', 'error');
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
    showStatus('AI options generated! Pick one below and publish.', 'success');
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

  // Metadata
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

  // Confidence badge
  const conf = data.ai.primary.confidence;
  const confBadge = document.getElementById('aiConfidence');
  confBadge.textContent = `Confidence: ${(conf * 100).toFixed(0)}%`;
  confBadge.className = 'confidence-badge ' + (conf >= 0.7 ? 'confidence-high' : conf >= 0.4 ? 'confidence-mid' : 'confidence-low');

  // AI Options
  const optionsContainer = document.getElementById('aiOptions');
  const options = [
    { label: 'Primary', tag: data.ai.primary.editorialTag, commentary: data.ai.primary.commentary },
    ...(data.ai.alternatives || []).map((alt, i) => ({ label: `Option ${i + 2}`, tag: alt.editorial_tag, commentary: alt.commentary })),
  ];

  optionsContainer.innerHTML = options.map((opt, i) => `
    <div class="ai-option ${i === 0 ? 'selected' : ''}" onclick="selectOption(this, '${escapeHtml(opt.tag)}', '${escapeHtml(opt.commentary)}')">
      <div class="ai-option-label">${opt.label}</div>
      <div class="ai-option-tag">${escapeHtml(opt.tag || 'No tag')}</div>
      <div class="ai-option-commentary">${escapeHtml(opt.commentary || 'No commentary')}</div>
    </div>
  `).join('');

  // Pre-fill edit fields with primary
  document.getElementById('editTag').value = data.ai.primary.editorialTag || '';
  document.getElementById('editCommentary').value = data.ai.primary.commentary || '';
  document.getElementById('editCategory').value = data.ai.category || 'News';
  document.getElementById('editFeatured').checked = false;
  document.getElementById('editBreaking').checked = false;

  // Scroll to result
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectOption(el, tag, commentary) {
  document.querySelectorAll('.ai-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('editTag').value = tag;
  document.getElementById('editCommentary').value = commentary;
}

// ------- Story Actions -------

async function publishStory() {
  if (!currentStoryId) return;
  await updateStory(currentStoryId, 'published');
  showStatus('Story published! It\'s now live in the feed.', 'success');
  document.getElementById('aiResult').style.display = 'none';
  setTimeout(() => location.reload(), 1000);
}

async function savePending() {
  if (!currentStoryId) return;
  await updateStory(currentStoryId, 'pending');
  showStatus('Story saved as pending.', 'success');
  document.getElementById('aiResult').style.display = 'none';
  setTimeout(() => location.reload(), 1000);
}

async function rejectStory() {
  if (!currentStoryId) return;
  await updateStory(currentStoryId, 'rejected');
  showStatus('Story rejected.', 'success');
  document.getElementById('aiResult').style.display = 'none';
  setTimeout(() => location.reload(), 1000);
}

async function regenerateAI() {
  if (!currentStoryId) return;
  showStatus('<span class="spinner"></span> Regenerating AI options...', 'loading');

  try {
    const res = await fetch(`/admin/stories/${currentStoryId}/regenerate`, { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      // Rebuild the AI options display
      const optionsContainer = document.getElementById('aiOptions');
      const options = [
        { label: 'Primary', tag: data.primary.editorialTag, commentary: data.primary.commentary },
        ...(data.alternatives || []).map((alt, i) => ({ label: `Option ${i + 2}`, tag: alt.editorial_tag, commentary: alt.commentary })),
      ];

      optionsContainer.innerHTML = options.map((opt, i) => `
        <div class="ai-option ${i === 0 ? 'selected' : ''}" onclick="selectOption(this, '${escapeHtml(opt.tag)}', '${escapeHtml(opt.commentary)}')">
          <div class="ai-option-label">${opt.label}</div>
          <div class="ai-option-tag">${escapeHtml(opt.tag || 'No tag')}</div>
          <div class="ai-option-commentary">${escapeHtml(opt.commentary || 'No commentary')}</div>
        </div>
      `).join('');

      document.getElementById('editTag').value = data.primary.editorialTag || '';
      document.getElementById('editCommentary').value = data.primary.commentary || '';
      document.getElementById('editCategory').value = data.category || 'News';

      const conf = data.primary.confidence;
      const confBadge = document.getElementById('aiConfidence');
      confBadge.textContent = `Confidence: ${(conf * 100).toFixed(0)}%`;
      confBadge.className = 'confidence-badge ' + (conf >= 0.7 ? 'confidence-high' : conf >= 0.4 ? 'confidence-mid' : 'confidence-low');

      showStatus('New AI options generated!', 'success');
    } else {
      showStatus(data.error || 'Regeneration failed.', 'error');
    }
  } catch (err) {
    showStatus('Network error: ' + err.message, 'error');
  }
}

async function updateStory(id, status) {
  const body = {
    status,
    editorialTag: document.getElementById('editTag').value,
    commentary: document.getElementById('editCommentary').value,
    category: document.getElementById('editCategory').value,
    isFeatured: document.getElementById('editFeatured').checked,
    isBreaking: document.getElementById('editBreaking').checked,
  };

  await fetch(`/admin/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ------- Quick Actions (from queue) -------

async function quickPublish(id) {
  await fetch(`/admin/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'published' }),
  });
  location.reload();
}

async function quickUnpublish(id) {
  await fetch(`/admin/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pending' }),
  });
  location.reload();
}

async function quickReject(id) {
  await fetch(`/admin/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' }),
  });
  location.reload();
}

// ------- Filter -------

function filterStories(status, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('.queue-card').forEach(card => {
    if (status === 'all' || card.dataset.status === status) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

// ------- Utilities -------

function showStatus(msg, type) {
  const el = document.getElementById('processStatus');
  el.innerHTML = msg;
  el.className = 'status-msg ' + type;
  el.style.display = 'block';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Enter key on URL input triggers processing
document.getElementById('urlInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') processUrl();
});
