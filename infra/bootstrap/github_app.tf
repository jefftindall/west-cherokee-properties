# GitHub has no hands-off App create API (manifest handshake only).
# Register with: node scripts/register-wcp-github-app.mjs
# That script writes real values here and sets GH_APP_* Actions variables.
# CI mints a short-lived installation token from the vault PEM. Do not
# data-source GITHUB-APP-PRIVATE-KEY (PEM must stay out of state).

resource "azurerm_key_vault_secret" "github_app_id" {
  name         = "GITHUB-APP-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "github_app_installation_id" {
  name         = "GITHUB-APP-INSTALLATION-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "github_app_private_key" {
  name         = "GITHUB-APP-PRIVATE-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

