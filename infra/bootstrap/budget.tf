data "azurerm_key_vault_secret" "alert_email_for_budget" {
  name         = azurerm_key_vault_secret.alert_email.name
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_key_vault_secret.alert_email]
}

locals {
  budget_alert_email_raw = trimspace(data.azurerm_key_vault_secret.alert_email_for_budget.value)
  budget_alert_email_configured = (
    local.budget_alert_email_raw != "" &&
    local.budget_alert_email_raw != "REPLACE_ME"
  )
  budget_start_date       = "2026-08-01T00:00:00Z"
  subscription_budget_usd = 50
}

resource "azurerm_consumption_budget_subscription" "monthly" {
  name            = "budget-wcp-monthly"
  subscription_id = data.azurerm_subscription.current.id

  amount     = local.subscription_budget_usd
  time_grain = "Monthly"

  time_period {
    start_date = local.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 80.0
    operator       = "GreaterThan"
    threshold_type = "Actual"

    contact_emails = local.budget_alert_email_configured ? [local.budget_alert_email_raw] : []
    contact_roles  = local.budget_alert_email_configured ? [] : ["Owner"]
  }

  notification {
    enabled        = true
    threshold      = 100.0
    operator       = "GreaterThan"
    threshold_type = "Actual"

    contact_emails = local.budget_alert_email_configured ? [local.budget_alert_email_raw] : []
    contact_roles  = local.budget_alert_email_configured ? [] : ["Owner"]
  }
}
