terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "azurerm" {
    subscription_id      = "5f82b068-cbaa-40bf-9d56-e9932a64a41c"
    resource_group_name  = "rg-wcp-tfstate"
    storage_account_name = "stwcpstateeu2"
    container_name       = "tfstate"
    key                  = "west-cherokee-properties/staging.tfstate"
  }
}

provider "azurerm" {
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
  resource_providers_to_register = [
    "Microsoft.Resources",
    "Microsoft.Storage",
    "Microsoft.KeyVault",
    "Microsoft.Web",
    "Microsoft.Authorization",
    "Microsoft.Insights",
    "Microsoft.OperationalInsights",
    "Microsoft.Sql",
  ]

  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
  }
}

provider "azuread" {}

provider "github" {
  owner = var.github_owner
}

module "site" {
  source = "../../modules/site"

  environment              = "staging"
  location                 = var.location
  custom_domain            = var.custom_domain
  custom_hostnames         = var.custom_hostnames
  github_owner             = var.github_owner
  github_owner_id          = var.github_owner_id
  github_repo              = var.github_repo
  github_repo_id           = var.github_repo_id
  manage_github_actions    = var.manage_github_actions
  rent_payments_enabled    = true
  purge_protection_enabled = false
}

output "static_web_app_default_host_name" {
  value = module.site.static_web_app_default_host_name
}

output "resource_group_name" {
  value = module.site.resource_group_name
}
