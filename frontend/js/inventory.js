let products = [];

const productForm = document.getElementById('productForm');
const productTableBody = document.getElementById('productTableBody');
const alertContainer = document.getElementById('alertContainer');

async function loadProducts() {
  const result = await api.get('/products');
  if (result.success) {
    products = result.data;
    renderProducts();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Laden der Produkte');
  }
}

function renderProducts() {
  if (products.length === 0) {
    productTableBody.innerHTML = '<tr><td colspan="5">Keine Produkte vorhanden</td></tr>';
    return;
  }

  productTableBody.innerHTML = products.map(product => `
    <tr>
      <td>${product.id}</td>
      <td>${product.name}</td>
      <td>${product.category}</td>
      <td>
        <input type="number" value="${product.quantity}" min="0"
               onchange="updateQuantity(${product.id}, this.value)"
               style="width: 80px; padding: 4px;">
      </td>
      <td class="action-buttons">
        <button class="btn btn-danger btn-small" onclick="deleteProduct(${product.id})">Löschen</button>
      </td>
    </tr>
  `).join('');
}

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('productName').value.trim();
  const category = document.getElementById('productCategory').value;
  const quantity = parseInt(document.getElementById('productQuantity').value, 10);

  if (!name || !category) {
    showAlert(alertContainer, 'Bitte alle Felder ausfüllen');
    return;
  }

  const result = await api.post('/products', { name, category, quantity });

  if (result.success) {
    showAlert(alertContainer, 'Produkt hinzugefügt', 'success');
    productForm.reset();
    await loadProducts();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Hinzufügen');
  }
});

async function updateQuantity(id, value) {
  const quantity = parseInt(value, 10);
  if (isNaN(quantity) || quantity < 0) {
    showAlert(alertContainer, 'Ungültige Menge');
    await loadProducts();
    return;
  }

  const result = await api.put(`/products/${id}`, { quantity });
  if (result.success) {
    showAlert(alertContainer, 'Menge aktualisiert', 'success');
    await loadProducts();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Aktualisieren');
    await loadProducts();
  }
}

async function deleteProduct(id) {
  if (!confirm('Produkt wirklich löschen?')) return;

  const result = await api.delete(`/products/${id}`);
  if (result.success) {
    showAlert(alertContainer, 'Produkt gelöscht', 'success');
    await loadProducts();
  } else {
    showAlert(alertContainer, result.message || 'Fehler beim Löschen');
  }
}

loadProducts();
