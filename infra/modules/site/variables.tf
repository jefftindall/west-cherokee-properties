variable "environment" {
  type = string
}

variable "location" {
  type    = string
  default = "eastus2"
}

variable "sql_location" {
  type        = string
  default     = ""
  description = "Azure SQL region. Defaults to location. Some new subscriptions block SQL in East US 2."
}

variable "create_sql" {
  type        = bool
  default     = true
  description = "Set false when the subscription cannot provision Azure SQL in allowed regions."
}

variable "custom_domain" {
  type    = string
  default = ""
}

variable "custom_hostnames" {
  type    = list(string)
  default = []
}

variable "github_owner" {
  type = string
}

variable "github_owner_id" {
  type = string
}

variable "github_repo" {
  type = string
}

variable "github_repo_id" {
  type = string
}

variable "github_branch" {
  type    = string
  default = "main"
}

variable "manage_github_actions" {
  type    = bool
  default = true
}

variable "purge_protection_enabled" {
  type    = bool
  default = false
}

variable "soft_delete_retention_days" {
  type    = number
  default = 7
}

variable "rent_payments_enabled" {
  type    = bool
  default = false
}

variable "shared_key_vault_name" {
  type    = string
  default = "kv-wcp-shared"
}

variable "shared_key_vault_resource_group_name" {
  type    = string
  default = "rg-wcp-shared"
}

variable "tags" {
  type    = map(string)
  default = {}
}
