export interface RepositoryIdentifier {
  repo: string
  owner: string
}

export interface DepotLocation extends RepositoryIdentifier {
  branch: string
  path: string
}

export interface DepotEntry {
  metadata: {
    location: string
  }
  name: string
  'py/object': 'pros.conductor.templates.base_template.BaseTemplate'
  supported_kernels: string
  target: string
  version: string
}

export type Depot = DepotEntry[]
