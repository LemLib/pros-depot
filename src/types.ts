export interface RepositoryIdentifier {
  repo: string
  owner: string
}

export interface DepotRoute {
  branch: string
  path: string
}

export interface DepotLocation extends RepositoryIdentifier, DepotRoute {}

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

export type DepotType = 'stable' | 'beta'

export type DepotRouteMap = Record<Extract<DepotType, 'stable'>, DepotRoute> &
  Record<Exclude<DepotType, 'stable'>, Partial<DepotRoute>>

export type DepotJsonMap = Record<'stable', string> &
  Partial<Record<DepotType, string>>

/** Describes what should and shouldn't be logged */
export interface LogConfig {
  /** Silences all warnings */
  quietWarnings: boolean
  /** Prevents logging of warnings for assets that are not templates */
  ignoreNonTemplateAssets: boolean
}

export interface Inputs {
  /** repo from which to parse releases */
  srcRepo: RepositoryIdentifier
  /** repo to which the depots will be placed */
  destRepo: RepositoryIdentifier
  token: string
  routes: DepotRouteMap
  readableJson: boolean
  message?: string
  logConfig: LogConfig
}
