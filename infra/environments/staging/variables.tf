variable "subscription_id" {
  type    = string
  default = "5f82b068-cbaa-40bf-9d56-e9932a64a41c"
}

variable "location" {
  type    = string
  default = "eastus2"
}

variable "custom_domain" {
  type    = string
  default = ""
}

variable "custom_hostnames" {
  type    = list(string)
  default = ["test.westcherokee.com"]
}

variable "github_owner" {
  type    = string
  default = "jefftindall"
}

variable "github_owner_id" {
  type    = string
  default = "10339968"
}

variable "github_repo" {
  type    = string
  default = "west-cherokee-properties"
}

variable "github_repo_id" {
  type    = string
  default = "1350171621"
}

variable "manage_github_actions" {
  type    = bool
  default = true
}
