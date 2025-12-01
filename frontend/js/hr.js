let employees = [];
let selectedEmployeeId = null;

const employeeForm = document.getElementById('employeeForm');
const employeeTableBody = document.getElementById('employeeTableBody');
const alertContainer = document.getElementById('alertContainer');
const workHoursSection = document.getElementById('workHoursSection');
const workHoursForm = document.getElementById('workHoursForm');
const workHoursTableBody = document.getElementById('workHoursTableBody');
const selectedEmployeeName = document.getElementById('selectedEmployeeName');
const calculatedSalary = document.getElementById('calculatedSalary');
const hoursLogged = document.getElementById('hoursLogged');

// ==================== EMPLOYEES ====================

async function loadEmployees() {
  const result = await api.get('/employees');
  if (result.success) {
    employees = result.data;
    renderEmployees();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Laden der Mitarbeiter');
  }
}

function renderEmployees() {
  if (employees.length === 0) {
    employeeTableBody.innerHTML = '<tr><td colspan="7">Keine Mitarbeiter vorhanden</td></tr>';
    return;
  }

  employeeTableBody.innerHTML = employees.map(emp => `
    <tr>
      <td>${emp.id}</td>
      <td>${emp.name}</td>
      <td>${emp.position}</td>
      <td>${emp.email}</td>
      <td>${emp.start_date}</td>
      <td>${emp.monthly_salary.toFixed(2)} EUR</td>
      <td class="action-buttons">
        <button class="btn btn-primary btn-small" onclick="selectEmployee(${emp.id}, '${emp.name}')">Stunden</button>
        <button class="btn btn-danger btn-small" onclick="deleteEmployee(${emp.id})">Loeschen</button>
      </td>
    </tr>
  `).join('');
}

employeeForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('employeeName').value.trim();
  const position = document.getElementById('employeePosition').value.trim();
  const email = document.getElementById('employeeEmail').value.trim();
  const start_date = document.getElementById('employeeStartDate').value;
  const monthly_salary = parseFloat(document.getElementById('employeeSalary').value);

  if (!name || !position || !email || !start_date) {
    showAlert(alertContainer, 'Bitte alle Felder ausfuellen');
    return;
  }

  if (isNaN(monthly_salary) || monthly_salary < 0) {
    showAlert(alertContainer, 'Bitte ein gueltiges Gehalt eingeben');
    return;
  }

  const result = await api.post('/employees', { name, position, email, start_date, monthly_salary });

  if (result.success) {
    showAlert(alertContainer, 'Mitarbeiter hinzugefuegt', 'success');
    employeeForm.reset();
    await loadEmployees();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Hinzufuegen');
  }
});

async function deleteEmployee(id) {
  if (!confirm('Mitarbeiter wirklich loeschen? Alle Arbeitsstunden werden ebenfalls geloescht.')) return;

  const result = await api.delete(`/employees/${id}`);
  if (result.success) {
    showAlert(alertContainer, 'Mitarbeiter geloescht', 'success');
    if (selectedEmployeeId === id) {
      workHoursSection.style.display = 'none';
      selectedEmployeeId = null;
    }
    await loadEmployees();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Loeschen');
  }
}

// ==================== WORK HOURS ====================

async function selectEmployee(id, name) {
  selectedEmployeeId = id;
  selectedEmployeeName.textContent = name;
  workHoursSection.style.display = 'block';

  // Set default date to today
  document.getElementById('workDate').valueAsDate = new Date();

  await loadWorkHours();
  await loadSalary();
}

async function loadWorkHours() {
  if (!selectedEmployeeId) return;

  const result = await api.get(`/work-hours/${selectedEmployeeId}`);
  if (result.success) {
    renderWorkHours(result.data);
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Laden der Arbeitsstunden');
  }
}

function renderWorkHours(workHours) {
  if (workHours.length === 0) {
    workHoursTableBody.innerHTML = '<tr><td colspan="3">Keine Arbeitsstunden erfasst</td></tr>';
    return;
  }

  workHoursTableBody.innerHTML = workHours.map(wh => `
    <tr>
      <td>${wh.date}</td>
      <td>${wh.hours}</td>
      <td class="action-buttons">
        <button class="btn btn-danger btn-small" onclick="deleteWorkHours(${wh.id})">Loeschen</button>
      </td>
    </tr>
  `).join('');
}

workHoursForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedEmployeeId) {
    showAlert(alertContainer, 'Bitte zuerst einen Mitarbeiter auswaehlen');
    return;
  }

  const date = document.getElementById('workDate').value;
  const hours = parseFloat(document.getElementById('workHours').value);

  if (!date) {
    showAlert(alertContainer, 'Bitte ein Datum auswaehlen');
    return;
  }

  if (isNaN(hours) || hours < 0 || hours > 24) {
    showAlert(alertContainer, 'Stunden muessen zwischen 0 und 24 liegen');
    return;
  }

  const result = await api.post('/work-hours', { employee_id: selectedEmployeeId, date, hours });

  if (result.success) {
    showAlert(alertContainer, 'Arbeitsstunden hinzugefuegt', 'success');
    document.getElementById('workHours').value = '';
    await loadWorkHours();
    await loadSalary();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Hinzufuegen');
  }
});

async function deleteWorkHours(id) {
  if (!confirm('Arbeitsstunden wirklich loeschen?')) return;

  const result = await api.delete(`/work-hours/${id}`);
  if (result.success) {
    showAlert(alertContainer, 'Arbeitsstunden geloescht', 'success');
    await loadWorkHours();
    await loadSalary();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Loeschen');
  }
}

// ==================== SALARY ====================

async function loadSalary() {
  if (!selectedEmployeeId) return;

  const result = await api.get(`/employees/${selectedEmployeeId}/salary`);
  if (result.success) {
    calculatedSalary.textContent = result.data.calculated_salary.toFixed(2);
    hoursLogged.textContent = result.data.hours_logged;
  } else {
    calculatedSalary.textContent = '-';
    hoursLogged.textContent = '0';
  }
}

// Initial load
loadEmployees();
