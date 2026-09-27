document.addEventListener('DOMContentLoaded', () => {
  let categories = [];
  let goals = [];

  // Elements
  const tabs = document.querySelectorAll('.nav-tab');
  const views = document.querySelectorAll('.view-section');
  const btnNewGoal = document.getElementById('btnNewGoal');
  const goalModal = document.getElementById('goalModal');
  const modalClose = document.getElementById('modalClose');
  const goalForm = document.getElementById('goalForm');
  const modalTitle = document.getElementById('modalTitle');
  const goalIdInput = document.getElementById('goalId');
  const goalTitleInput = document.getElementById('goalTitleInput');
  const goalCategoryInput = document.getElementById('goalCategoryInput');
  const goalDateInput = document.getElementById('goalDateInput');
  const goalDescInput = document.getElementById('goalDescInput');
  const goalStatusRow = document.getElementById('goalStatusRow');
  const goalStatusInput = document.getElementById('goalStatusInput');
  const milestonesSection = document.getElementById('milestonesSection');
  const milestoneForm = document.getElementById('milestoneForm');
  const milestoneTitleInput = document.getElementById('milestoneTitleInput');
  const milestonesList = document.getElementById('milestonesList');
  const btnDeleteGoal = document.getElementById('btnDeleteGoal');
  
  const filterStatus = document.getElementById('filterStatus');
  const filterCategory = document.getElementById('filterCategory');
  
  const categoryForm = document.getElementById('categoryForm');
  const categoriesList = document.getElementById('categoriesList');

  // Navigation Tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      const targetView = document.getElementById(`view-${tab.dataset.view}`);
      if (targetView) targetView.classList.add('active');
      if (tab.dataset.view === 'dashboard') loadDashboard();
      if (tab.dataset.view === 'goals') loadGoals();
      if (tab.dataset.view === 'categories') loadCategories();
    });
  });

  // Modal handlers
  btnNewGoal.addEventListener('click', () => openGoalModal());
  modalClose.addEventListener('click', () => goalModal.classList.remove('active'));
  goalModal.addEventListener('click', (e) => {
    if (e.target === goalModal) goalModal.classList.remove('active');
  });

  // Filters change
  filterStatus.addEventListener('change', loadGoals);
  filterCategory.addEventListener('change', loadGoals);

  // Initial Load
  loadCategories(true).then(() => {
    loadDashboard();
  });

  async function fetchJSON(url, options = {}) {
    try {
      const res = await fetch(url, options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'API Error');
      return data;
    } catch (err) {
      console.error(err);
      alert(err.message);
      throw err;
    }
  }

  async function loadCategories(populateSelects = false) {
    try {
      categories = await fetchJSON('/api/categories');
      if (populateSelects) {
        const optionsHtml = '<option value="">None / All</option>' + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        goalCategoryInput.innerHTML = '<option value="">None</option>' + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        filterCategory.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
      renderCategoriesList();
    } catch (e) {}
  }

  function renderCategoriesList() {
    if (categories.length === 0) {
      categoriesList.innerHTML = '<div class="empty-state">No categories found.</div>';
      return;
    }
    categoriesList.innerHTML = categories.map(c => `
      <div class="category-badge-item">
        <div>
          <span class="category-color-dot" style="background: ${c.color || '#3b82f6'}"></span>
          <strong>${escapeHtml(c.name)}</strong>
        </div>
      </div>
    `).join('');
  }

  categoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('catName').value;
    const color = document.getElementById('catColor').value;
    try {
      await fetchJSON('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
      });
      document.getElementById('catName').value = '';
      await loadCategories(true);
    } catch (e) {}
  });

  async function loadDashboard() {
    try {
      const data = await fetchJSON('/api/dashboard');
      document.getElementById('statActiveGoals').textContent = data.stats.active_goals;
      document.getElementById('statCompletedGoals').textContent = data.stats.completed_goals;
      
      const totalM = data.stats.total_milestones;
      const compM = data.stats.completed_milestones;
      const pct = totalM > 0 ? Math.round((compM / totalM) * 100) : 0;
      document.getElementById('statMilestoneProgress').textContent = pct + '%';

      const upcomingContainer = document.getElementById('dashboardUpcomingList');
      if (data.upcoming_goals.length === 0) {
        upcomingContainer.innerHTML = '<div class="empty-state">No active goals. Click "New Goal" to get started!</div>';
      } else {
        upcomingContainer.innerHTML = data.upcoming_goals.map(goal => renderGoalCard(goal)).join('');
        attachCardListeners();
      }
    } catch (e) {}
  }

  async function loadGoals() {
    try {
      const status = filterStatus.value;
      const catId = filterCategory.value;
      let url = '/api/goals?';
      if (status) url += `status=${status}&`;
      if (catId) url += `category_id=${catId}&`;

      goals = await fetchJSON(url);
      const goalsContainer = document.getElementById('goalsList');
      if (goals.length === 0) {
        goalsContainer.innerHTML = '<div class="empty-state">No goals match the filter.</div>';
      } else {
        goalsContainer.innerHTML = goals.map(goal => renderGoalCard(goal)).join('');
        attachCardListeners();
      }
    } catch (e) {}
  }

  function renderGoalCard(goal) {
    const catBadge = goal.category_name ? `<span class="badge badge-category" style="background:${goal.category_color}20; color:${goal.category_color}">${escapeHtml(goal.category_name)}</span>` : '';
    const statusBadge = `<span class="badge badge-${goal.status}">${goal.status}</span>`;
    const targetDateStr = goal.target_date ? `Due: ${goal.target_date}` : 'No deadline';

    return `
      <div class="goal-card" data-id="${goal.id}">
        <div>
          <div class="goal-header">
            <div class="goal-title">${escapeHtml(goal.title)}</div>
            ${statusBadge}
          </div>
          <div class="goal-desc">${escapeHtml(goal.description || 'No description provided.')}</div>
        </div>
        <div class="goal-footer">
          <div class="progress-container">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${goal.progress}%"></div>
            </div>
            <div class="progress-text">${goal.progress}%</div>
          </div>
          <div class="goal-meta">
            <span>${catBadge}</span>
            <span>${targetDateStr}</span>
          </div>
        </div>
      </div>
    `;
  }

  function attachCardListeners() {
    document.querySelectorAll('.goal-card').forEach(card => {
      card.addEventListener('click', () => {
        openGoalModal(card.dataset.id);
      });
    });
  }

  async function openGoalModal(goalId = null) {
    goalForm.reset();
    goalIdInput.value = '';
    milestonesSection.style.display = 'none';
    goalStatusRow.style.display = 'none';
    btnDeleteGoal.style.display = 'none';

    if (goalId) {
      modalTitle.textContent = 'Edit Goal & Milestones';
      goalStatusRow.style.display = 'block';
      btnDeleteGoal.style.display = 'inline-block';

      try {
        const goal = await fetchJSON(`/api/goals/${goalId}`);
        goalIdInput.value = goal.id;
        goalTitleInput.value = goal.title;
        goalCategoryInput.value = goal.category_id || '';
        goalDateInput.value = goal.target_date || '';
        goalDescInput.value = goal.description || '';
        goalStatusInput.value = goal.status;

        milestonesSection.style.display = 'block';
        renderMilestones(goal.milestones);
      } catch (e) {
        return;
      }
    } else {
      modalTitle.textContent = 'Create New Goal';
    }

    goalModal.classList.add('active');
  }

  goalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = goalIdInput.value;
    const payload = {
      title: goalTitleInput.value,
      category_id: goalCategoryInput.value ? Number(goalCategoryInput.value) : null,
      target_date: goalDateInput.value || null,
      description: goalDescInput.value,
      status: id ? goalStatusInput.value : 'active'
    };

    try {
      if (id) {
        await fetchJSON(`/api/goals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetchJSON('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      goalModal.classList.remove('active');
      loadDashboard();
      loadGoals();
    } catch (e) {}
  });

  btnDeleteGoal.addEventListener('click', async () => {
    const id = goalIdInput.value;
    if (!id || !confirm('Are you sure you want to delete this goal and all its milestones?')) return;
    try {
      await fetchJSON(`/api/goals/${id}`, { method: 'DELETE' });
      goalModal.classList.remove('active');
      loadDashboard();
      loadGoals();
    } catch (e) {}
  });

  // Milestones
  milestoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const goalId = goalIdInput.value;
    const title = milestoneTitleInput.value;
    if (!goalId || !title) return;

    try {
      await fetchJSON(`/api/goals/${goalId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      milestoneTitleInput.value = '';
      openGoalModal(goalId); // Refresh modal milestones
      loadDashboard();
      loadGoals();
    } catch (e) {}
  });

  function renderMilestones(milestones) {
    if (!milestones || milestones.length === 0) {
      milestonesList.innerHTML = '<div class="empty-state" style="padding:15px;">No milestones yet. Add your first step above!</div>';
      return;
    }

    milestonesList.innerHTML = milestones.map(m => `
      <div class="milestone-item ${m.completed ? 'completed' : ''}" data-id="${m.id}">
        <div class="milestone-left">
          <input type="checkbox" class="milestone-checkbox" ${m.completed ? 'checked' : ''}>
          <span class="milestone-title">${escapeHtml(m.title)}</span>
        </div>
        <button class="btn-icon btn-delete-milestone" title="Delete milestone">&times;</button>
      </div>
    `).join('');

    milestonesList.querySelectorAll('.milestone-item').forEach(item => {
      const mId = item.dataset.id;
      const checkbox = item.querySelector('.milestone-checkbox');
      const delBtn = item.querySelector('.btn-delete-milestone');

      checkbox.addEventListener('change', async () => {
        try {
          await fetchJSON(`/api/milestones/${mId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: checkbox.checked })
          });
          openGoalModal(goalIdInput.value);
          loadDashboard();
          loadGoals();
        } catch (e) {}
      });

      delBtn.addEventListener('click', async () => {
        try {
          await fetchJSON(`/api/milestones/${mId}`, { method: 'DELETE' });
          openGoalModal(goalIdInput.value);
          loadDashboard();
          loadGoals();
        } catch (e) {}
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"/]/g, function (s) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
        '/': '&#x2F;'
      }[s];
    });
  }
});
