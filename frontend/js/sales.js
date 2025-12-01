let customers = [];
let products = [];
let orders = [];
let orderItemIndex = 0;

const customerForm = document.getElementById('customerForm');
const customerTableBody = document.getElementById('customerTableBody');
const orderForm = document.getElementById('orderForm');
const orderTableBody = document.getElementById('orderTableBody');
const orderCustomerSelect = document.getElementById('orderCustomer');
const orderItemsContainer = document.getElementById('orderItemsContainer');
const addItemBtn = document.getElementById('addItemBtn');
const alertContainer = document.getElementById('alertContainer');

// ==================== CUSTOMERS ====================

async function loadCustomers() {
  const result = await api.get('/customers');
  if (result.success) {
    customers = result.data;
    renderCustomers();
    updateCustomerSelect();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Laden der Kunden');
  }
}

function renderCustomers() {
  if (customers.length === 0) {
    customerTableBody.innerHTML = '<tr><td colspan="6">Keine Kunden vorhanden</td></tr>';
    return;
  }

  customerTableBody.innerHTML = customers.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.name}</td>
      <td>${c.email}</td>
      <td>${c.phone || '-'}</td>
      <td>${c.address || '-'}</td>
      <td class="action-buttons">
        <button class="btn btn-danger btn-small" onclick="deleteCustomer(${c.id})">Loeschen</button>
      </td>
    </tr>
  `).join('');
}

function updateCustomerSelect() {
  orderCustomerSelect.innerHTML = '<option value="">-- Kunde auswaehlen --</option>' +
    customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

customerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('customerName').value.trim();
  const email = document.getElementById('customerEmail').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const address = document.getElementById('customerAddress').value.trim();

  if (!name || !email) {
    showAlert(alertContainer, 'Name und E-Mail sind erforderlich');
    return;
  }

  const result = await api.post('/customers', { name, email, phone, address });

  if (result.success) {
    showAlert(alertContainer, 'Kunde hinzugefuegt', 'success');
    customerForm.reset();
    await loadCustomers();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Hinzufuegen');
  }
});

async function deleteCustomer(id) {
  if (!confirm('Kunde wirklich loeschen?')) return;

  const result = await api.delete(`/customers/${id}`);
  if (result.success) {
    showAlert(alertContainer, 'Kunde geloescht', 'success');
    await loadCustomers();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Loeschen');
  }
}

// ==================== PRODUCTS ====================

async function loadProducts() {
  const result = await api.get('/products');
  if (result.success) {
    products = result.data;
    updateAllProductSelects();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Laden der Produkte');
  }
}

function updateAllProductSelects() {
  const selects = document.querySelectorAll('.product-select');
  selects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Produkt auswaehlen --</option>' +
      products.map(p => `<option value="${p.id}">${p.name} (Verfuegbar: ${p.quantity})</option>`).join('');
    select.value = currentValue;
  });
}

// ==================== ORDER ITEMS ====================

function createOrderItemRow(index) {
  const div = document.createElement('div');
  div.className = 'order-item-row';
  div.dataset.index = index;
  div.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>Produkt</label>
        <select name="product_id" class="product-select" required>
          <option value="">-- Produkt auswaehlen --</option>
          ${products.map(p => `<option value="${p.id}">${p.name} (Verfuegbar: ${p.quantity})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Menge</label>
        <input type="number" name="quantity" min="1" value="1" class="quantity-input" required>
      </div>
      <div class="form-group" style="display: flex; align-items: flex-end;">
        <button type="button" class="btn btn-danger btn-small remove-item-btn">Entfernen</button>
      </div>
    </div>
  `;
  return div;
}

addItemBtn.addEventListener('click', () => {
  orderItemIndex++;
  const newRow = createOrderItemRow(orderItemIndex);
  orderItemsContainer.appendChild(newRow);
  updateRemoveButtons();
});

orderItemsContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('remove-item-btn')) {
    const row = e.target.closest('.order-item-row');
    if (row) {
      row.remove();
      updateRemoveButtons();
    }
  }
});

function updateRemoveButtons() {
  const rows = document.querySelectorAll('.order-item-row');
  rows.forEach((row, index) => {
    const btn = row.querySelector('.remove-item-btn');
    if (btn) {
      btn.style.display = rows.length > 1 ? 'block' : 'none';
    }
  });
}

function getOrderItems() {
  const rows = document.querySelectorAll('.order-item-row');
  const items = [];
  rows.forEach(row => {
    const productSelect = row.querySelector('.product-select');
    const quantityInput = row.querySelector('.quantity-input');
    if (productSelect.value && quantityInput.value) {
      items.push({
        product_id: parseInt(productSelect.value),
        quantity: parseInt(quantityInput.value)
      });
    }
  });
  return items;
}

function resetOrderItems() {
  const rows = document.querySelectorAll('.order-item-row');
  rows.forEach((row, index) => {
    if (index > 0) {
      row.remove();
    } else {
      row.querySelector('.product-select').value = '';
      row.querySelector('.quantity-input').value = '1';
    }
  });
  orderItemIndex = 0;
  updateRemoveButtons();
}

// ==================== ORDERS ====================

async function loadOrders() {
  const result = await api.get('/orders');
  if (result.success) {
    orders = result.data;
    renderOrders();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Laden der Bestellungen');
  }
}

function renderOrders() {
  if (orders.length === 0) {
    orderTableBody.innerHTML = '<tr><td colspan="6">Keine Bestellungen vorhanden</td></tr>';
    return;
  }

  orderTableBody.innerHTML = orders.map(order => {
    const customer = customers.find(c => c.id === order.customer_id);
    const customerName = customer ? customer.name : `Kunde #${order.customer_id}`;
    const itemsSummary = order.items.map(item => `${item.quantity}x ${item.product_name || 'Produkt #' + item.product_id}`).join(', ');

    return `
      <tr>
        <td>${order.id}</td>
        <td>${customerName}</td>
        <td>${order.order_date}</td>
        <td>${order.status}</td>
        <td>${itemsSummary || '-'}</td>
        <td class="action-buttons">
          <button class="btn btn-danger btn-small" onclick="deleteOrder(${order.id})">Loeschen</button>
        </td>
      </tr>
    `;
  }).join('');
}

orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const customer_id = parseInt(orderCustomerSelect.value);
  if (!customer_id) {
    showAlert(alertContainer, 'Bitte einen Kunden auswaehlen');
    return;
  }

  const items = getOrderItems();
  if (items.length === 0) {
    showAlert(alertContainer, 'Bitte mindestens ein Produkt hinzufuegen');
    return;
  }

  const result = await api.post('/orders', { customer_id, items });

  if (result.success) {
    showAlert(alertContainer, 'Bestellung erstellt', 'success');
    orderCustomerSelect.value = '';
    resetOrderItems();
    await loadOrders();
    await loadProducts(); // Refresh product quantities
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Erstellen der Bestellung');
  }
});

async function deleteOrder(id) {
  if (!confirm('Bestellung wirklich loeschen? Der Lagerbestand wird wiederhergestellt.')) return;

  const result = await api.delete(`/orders/${id}`);
  if (result.success) {
    showAlert(alertContainer, 'Bestellung geloescht, Lagerbestand wiederhergestellt', 'success');
    await loadOrders();
    await loadProducts(); // Refresh product quantities
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Loeschen');
  }
}

// ==================== INIT ====================

async function init() {
  await loadCustomers();
  await loadProducts();
  await loadOrders();
  updateRemoveButtons();
}

init();
