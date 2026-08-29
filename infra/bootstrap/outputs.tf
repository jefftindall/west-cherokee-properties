output "resource_group_name" {
  value = azurerm_resource_group.tfstate.name
}

output "storage_account_name" {
  value = azurerm_storage_account.tfstate.name
}

output "container_name" {
  value = azurerm_storage_container.tfstate.name
}

output "terraform_client_id" {
  description = "Entra application (client) ID for GitHub Actions Terraform OIDC"
  value       = azuread_application.terraform.client_id
}

output "terraform_tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}

output "terraform_subscription_id" {
  value = data.azurerm_client_config.current.subscription_id
}

output "shared_key_vault_name" {
  value = azurerm_key_vault.shared.name
}

output "shared_key_vault_resource_group_name" {
  value = azurerm_resource_group.shared.name
}
