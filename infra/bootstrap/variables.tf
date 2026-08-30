variable "subscription_id" {
  type        = string
  description = "Azure subscription targeted by this Terraform stack"
  default     = "5f82b068-cbaa-40bf-9d56-e9932a64a41c"
}

variable "location" {
  type        = string
  description = "Azure region for Terraform remote state storage"
  default     = "eastus2"
}

variable "resource_group_name" {
  type        = string
  description = "Shared resource group for Terraform state"
  default     = "rg-wcp-tfstate"
}

variable "storage_account_name" {
  type        = string
  description = "Globally unique storage account name (3–24 lowercase alphanumeric)"
  default     = "stwcpstateeu2"
}

variable "container_name" {
  type        = string
  description = "Blob container for environment state files"
  default     = "tfstate"
}

variable "tags" {
  type = map(string)
  default = {
    project = "west-cherokee-properties"
    purpose = "terraform-remote-state"
    managed = "terraform"
  }
}

variable "github_owner" {
  type        = string
  description = "GitHub org or user that owns the repo"
  default     = "jefftindall"
}

variable "github_owner_id" {
  type        = string
  description = "Numeric GitHub owner ID used in OIDC subject claims"
  default     = "10339968"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name"
  default     = "west-cherokee-properties"
}

variable "github_repo_id" {
  type        = string
  description = "Numeric GitHub repository ID used in OIDC subject claims."
  default     = "1350171621"
}

variable "manage_github_actions" {
  type        = bool
  description = "When true, set repo-level AZURE_TF_* Actions variables (requires a local GH_TOKEN). GH_APP_* is set by scripts/register-wcp-github-app.mjs."
  default     = true
}
