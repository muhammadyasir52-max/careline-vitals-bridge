const API_BASE = window.API_BASE || 'http://localhost:3000/api/v1';

const adapterFieldGroups = {
  fhir: document.getElementById('fhir-fields'),
  hl7v2: document.getElementById('hl7v2-fields'),
  'custom-rest': document.getElementById('custom-rest-fields'),
};

document.getElementById('adapter-type').addEventListener('change', (e) => {
  for (const [type, el] of Object.entries(adapterFieldGroups)) {
    el.hidden = type !== e.target.value;
  }
});

function buildEmrAdapter(formData) {
  const type = formData.get('adapterType');
  if (type === 'fhir') {
    return {
      type,
      config: {
        baseUrl: formData.get('baseUrl'),
        authHeader: formData.get('authHeader') || undefined,
      },
    };
  }
  if (type === 'hl7v2') {
    return {
      type,
      config: {
        host: formData.get('host'),
        port: Number(formData.get('port')),
        sendingApplication: formData.get('sendingApplication') || undefined,
        sendingFacility: formData.get('sendingFacility') || undefined,
      },
    };
  }
  return {
    type,
    config: {
      url: formData.get('url'),
      authHeader: formData.get('customAuthHeader') || undefined,
    },
  };
}

document.getElementById('tenant-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = {
    name: formData.get('name'),
    emrAdapter: buildEmrAdapter(formData),
  };

  const resultEl = document.getElementById('tenant-result');
  resultEl.textContent = 'Creating tenant...';

  try {
    const res = await fetch(`${API_BASE}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    resultEl.textContent = JSON.stringify(data, null, 2);
    if (res.ok) {
      e.target.reset();
      loadTenants();
    }
  } catch (err) {
    resultEl.textContent = `Error: ${err.message}`;
  }
});

async function loadTenants() {
  const res = await fetch(`${API_BASE}/tenants`);
  const tenants = await res.json();
  const tbody = document.querySelector('#tenants-table tbody');
  tbody.innerHTML = '';
  for (const tenant of tenants) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = tenant.name;

    const adapterTd = document.createElement('td');
    adapterTd.textContent = tenant.emrAdapter.type;

    const keyTd = document.createElement('td');
    keyTd.textContent = tenant.apiKey;

    const dashTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'link-btn';
    btn.textContent = 'View dashboard';
    btn.addEventListener('click', () => loadDashboard(tenant.tenantId));
    dashTd.appendChild(btn);

    tr.append(nameTd, adapterTd, keyTd, dashTd);
    tbody.appendChild(tr);
  }
}

async function loadDashboard(tenantId) {
  const res = await fetch(`${API_BASE}/tenants/${tenantId}/dashboard`);
  const data = await res.json();
  const el = document.getElementById('dashboard');

  if (!res.ok) {
    el.textContent = data.error || 'Failed to load dashboard';
    return;
  }

  el.innerHTML = `
    <h3>${data.tenant.name}</h3>
    <div class="stat-grid">
      <div class="stat-card"><div class="value">${data.totalReadings}</div><div class="label">Total readings</div></div>
      <div class="stat-card"><div class="value">${data.sentCount}</div><div class="label">Sent to EMR</div></div>
      <div class="stat-card"><div class="value">${data.failedCount}</div><div class="label">Failed</div></div>
      <div class="stat-card"><div class="value">${data.deadLetterCount}</div><div class="label">Dead-lettered</div></div>
      <div class="stat-card"><div class="value">${data.syncSuccessRate !== null ? Math.round(data.syncSuccessRate * 100) + '%' : '—'}</div><div class="label">Sync success rate</div></div>
    </div>
    <p>Last reading received: ${data.lastReadingAt || 'never'}</p>
    <h4>Recent audit log</h4>
    <pre>${JSON.stringify(data.recentAudit, null, 2)}</pre>
  `;
}

document.getElementById('refresh-tenants').addEventListener('click', loadTenants);
loadTenants();
