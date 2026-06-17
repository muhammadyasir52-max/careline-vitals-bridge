const VITAL_LABELS = {
  '8310-5': 'Temperature',
  '8480-6': 'BP Systolic',
  '8462-4': 'BP Diastolic',
  '59408-5': 'SpO2',
  '8867-4': 'Pulse',
};

let activePatientId = null;

async function loadPatients() {
  const res = await fetch('/api/patients');
  const patients = await res.json();
  const list = document.getElementById('patient-list');
  list.innerHTML = '';
  for (const patient of patients) {
    const li = document.createElement('li');
    li.textContent = patient.name?.[0]?.text || patient.id;
    li.dataset.id = patient.id;
    if (!activePatientId) activePatientId = patient.id;
    if (patient.id === activePatientId) li.classList.add('active');
    li.addEventListener('click', () => {
      activePatientId = patient.id;
      loadPatients();
      loadObservations();
    });
    list.appendChild(li);
  }
  document.getElementById('chart-title').textContent =
    `Patient chart — ${patients.find((p) => p.id === activePatientId)?.name?.[0]?.text || ''} (vital signs)`;
}

async function loadObservations() {
  if (!activePatientId) return;
  const res = await fetch(`/ws/fhir2/R4/Observation?subject=Patient/${activePatientId}`);
  const data = await res.json();
  const tbody = document.querySelector('#obs-table tbody');
  tbody.innerHTML = '';
  for (const entry of data.entry || []) {
    const obs = entry.resource;
    const tr = document.createElement('tr');

    const tdTime = document.createElement('td');
    tdTime.textContent = new Date(obs.effectiveDateTime).toLocaleString();

    const tdVital = document.createElement('td');
    const code = obs.code?.coding?.[0]?.code;
    tdVital.textContent = VITAL_LABELS[code] || obs.code?.coding?.[0]?.display || code;

    const tdValue = document.createElement('td');
    tdValue.textContent = `${obs.valueQuantity?.value} ${obs.valueQuantity?.unit}`;

    const tdDevice = document.createElement('td');
    tdDevice.textContent = obs.device?.display || '—';

    tr.append(tdTime, tdVital, tdValue, tdDevice);
    tbody.appendChild(tr);
  }
}

async function refresh() {
  await loadPatients();
  await loadObservations();
}

refresh();
setInterval(loadObservations, 2000);
