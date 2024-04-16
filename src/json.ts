import { Octokit } from '@octokit/rest'
import AdmZip from 'adm-zip'
import { Depot, DepotEntry, DepotJsonMap } from './types'
import semver from 'semver'

export interface TemplateDetails {
  name: string
  supported_kernels: string | null
  target: string
  version: string
  url: string
}
export namespace TemplateDetails {
  export const keys = [
    'name',
    'supported_kernels',
    'target',
    'version',
    'url'
  ] as const
  export const keysOmitUrl = keys.filter(
    (key): key is Exclude<(typeof keys)[number], 'url'> => key !== 'url'
  )
  export function validate(details: unknown): details is TemplateDetails {
    return (
      details !== null &&
      typeof details === 'object' &&
      // for every key in the details object, check if it exists and is a string
      // TODO: add a compile time check to ensure these are all the keys of TemplateDetails
      TemplateDetails.keys.every(
        key =>
          key in details &&
          typeof (details as Record<typeof key, unknown>)[key] === 'string'
      )
    )
  }
}

namespace retrieveTemplateDetails {
  export type Input = {
    repo: string
    owner: string
    asset_id: number
    asset_url: string
  }
  export type ErrorBody = Input
  export type Error = (
    | { error: 'failed to download the asset zip file' }
    | {
        error: 'unknown asset type (no template.pros or project.pros file)'
        body: { zipContents: Array<string> }
      }
    | {
        error: 'asset is a project, not a template (no template.pros file, but there is a project.pros file)'
        body: { zipContents: Array<string> }
      }
    | {
        error: 'failed to validate template details'
        body: { details: unknown }
      }
  ) & { body: ErrorBody }
}

/** Downloads asset from GitHub, unzips it, and then parses the `template.pros` file to get its {@linkcode TemplateDetails} */
async function retrieveTemplateDetails(
  input: retrieveTemplateDetails.Input,
  client: Octokit
): Promise<TemplateDetails | retrieveTemplateDetails.Error> {
  const { repo, owner, asset_id, asset_url } = input

  // Download the asset zip file
  // NOTE: this could be done without github's api for more extensibility, but this works for now
  const rawAsset = await client.repos.getReleaseAsset({
    repo,
    owner,
    asset_id,
    headers: { accept: 'application/octet-stream' }
  })
  const data = rawAsset.data
  if (data instanceof ArrayBuffer) {
    const zip = new AdmZip(Buffer.from(data))
    const templateJsonEntry = zip.getEntry('template.pros')

    // If we can't find the template.pros file, then return an error
    if (templateJsonEntry == null) {
      const entries = zip.getEntries().map(entry => entry.entryName)
      const errorBody = { ...input, zipContents: entries }
      // Checks if the asset is a project for debugging purposes
      if (zip.getEntry('project.pros') == null)
        return {
          error: 'unknown asset type (no template.pros or project.pros file)',
          body: errorBody
        }
      return {
        error:
          'asset is a project, not a template (no template.pros file, but there is a project.pros file)',
        body: errorBody
      }
    }

    // Parse the template.pros file
    const templateJson = JSON.parse(zip.readAsText(templateJsonEntry))
    const templateInfo = templateJson['py/state']
    const details = {
      name: templateInfo.name,
      supported_kernels: templateInfo.supported_kernels,
      target: templateInfo.target,
      version: templateInfo.version,
      url: asset_url
    }

    // Ensure that the template details are valid
    if (TemplateDetails.validate(details)) return details
    // If they aren't, return an error
    else
      return {
        error: 'failed to validate template details',
        body: { ...input, details }
      }
  }
  return {
    error: 'failed to download the asset zip file',
    body: { ...input }
  }
}

/**
 *  Converts a {@linkcode  TemplateDetails} object into a {@linkcode DepotEntry}
 *  such that it can be parsed by the {@linkcode https://github.com/purduesigbots/pros-cli pros-cli}
 */
function createDepotEntry({
  name,
  supported_kernels,
  target,
  version,
  url
}: TemplateDetails): DepotEntry {
  return {
    metadata: {
      location: url
    },
    name,
    'py/object': 'pros.conductor.templates.base_template.BaseTemplate',
    supported_kernels,
    target,
    version
  }
}

function stringifyDepot(depot: Depot, readable: boolean): string {
  return JSON.stringify(depot, null, readable ? 2 : undefined)
}

/**
 * @returns keys missing in the object
 */
function findMissingKeys<Keys extends string | number | symbol>(
  obj: object,
  keys: Keys[]
): Keys[] {
  return keys.filter(key => !(key in obj))
}

function hasKeys<Keys extends string | number | symbol>(
  obj: object,
  keys: Keys[]
): obj is Record<Keys, unknown> {
  return findMissingKeys(obj, keys).length === 0
}

/**
 * Creates a {@linkcode TemplateDetails} object from a template.pros file.
 * @param json
 */
export function createTemplateDetailsFromTemplateManifest(
  json: string,
  downloadUrl: string
):
  | TemplateDetails
  | { error: 'Malformed template.pros file'; parsedJson: unknown }
  | {
      error: 'template.pros["py/state"] is missing required keys'
      missingKeys: Exclude<keyof TemplateDetails, 'url'>[]
      parsedJson: unknown
    }
  | {
      error: 'failed to validate template details'
      templateDetails: Record<keyof TemplateDetails, unknown>
    } {
  const templateJson: unknown = JSON.parse(json)
  if (
    templateJson == null ||
    typeof templateJson !== 'object' ||
    !('py/state' in templateJson)
  ) {
    return { error: 'Malformed template.pros file', parsedJson: templateJson }
  }

  const templateInfo = templateJson['py/state']
  if (templateInfo == null || typeof templateInfo !== 'object') {
    return { error: 'Malformed template.pros file', parsedJson: templateJson }
  }
  if (!hasKeys(templateInfo, TemplateDetails.keysOmitUrl)) {
    return {
      error: `template.pros["py/state"] is missing required keys`,
      missingKeys: findMissingKeys(templateInfo, TemplateDetails.keysOmitUrl),
      parsedJson: templateJson
    }
  }
  const maybeDetails = {
    name: templateInfo?.name,
    supported_kernels: templateInfo.supported_kernels,
    target: templateInfo.target,
    version: templateInfo.version,
    url: downloadUrl
  }
  if (TemplateDetails.validate(maybeDetails)) return maybeDetails

  return {
    error: 'failed to validate template details',
    templateDetails: maybeDetails
  }
}

export async function createTemplateDetailsFromDownloadUrl(
  downloadUrl: string
): Promise<
  | TemplateDetails
  | {
      error: 'template.pros file not present in the zip file'
      zipContents: string[]
    }
  | {
      error: 'downloaded zip is a pros project, not a template (project.pros is present and template.pros is not)'
      zipContents: string[]
    }
  | {
      error: 'failed to download the asset zip file'
      status: number
      statusText: string
    }
  | ReturnType<typeof createTemplateDetailsFromTemplateManifest>
> {
  const response = await fetch(downloadUrl)
  if (response.status !== 200) {
    // if the response status is not 200, then return an error
    return {
      error: 'failed to download the asset zip file',
      status: response.status,
      statusText: response.statusText
    }
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const zip = new AdmZip(buffer)
  const templateJsonEntry = zip.getEntry('template.pros')

  // if we can't find the template.pros file, then return an error
  if (templateJsonEntry == null) {
    const zipContents = zip.getEntries().map(entry => entry.entryName)
    if (zip.getEntry('project.pros') != null)
      return {
        error:
          'downloaded zip is a pros project, not a template (project.pros is present and template.pros is not)',
        zipContents: zipContents
      }
    return {
      error: 'template.pros file not present in the zip file',
      zipContents
    }
  }

  const templateJsonString = zip.readAsText(templateJsonEntry)
  return createTemplateDetailsFromTemplateManifest(
    templateJsonString,
    downloadUrl
  )
}

export function createDepotJson(
  details: Array<TemplateDetails>,
  humanReadable = true
): string {
  const depotEntries = details.map(createDepotEntry)
  const jsonString = stringifyDepot(depotEntries, humanReadable)
  return jsonString
}

export async function createDepotJsonFromDownloadUrls(
  downloadUrls: string[]
): Promise<{
  depotJson: string
  errors: Array<
    Exclude<
      Awaited<ReturnType<typeof createTemplateDetailsFromDownloadUrl>>,
      TemplateDetails
    >
  >
}> {
  const rawDetails = await Promise.all(
    downloadUrls.map(url => createTemplateDetailsFromDownloadUrl(url))
  )
  const errors = rawDetails.filter(
    (
      res
    ): res is Exclude<
      Awaited<ReturnType<typeof createTemplateDetailsFromDownloadUrl>>,
      TemplateDetails
    > => 'error' in res
  )
  const details = rawDetails.filter(
    (res): res is TemplateDetails => !('error' in res)
  )
  return {
    depotJson: createDepotJson(details),
    errors
  }
}

/**
 * Creates a JSON string by populating the depot with templates from a GitHub repository.
 * @param repoId The repository to populate the depot from.
 * @param client The client to use for GitHub API requests.
 * @param readable Whether to format the JSON string for human readability.
 * @param unified Whether the beta and stable versions should be contained in a single depot.
 * @param quietWarnings prevents warnings regarding {@link retrieveTemplateDetails.Error} from being logged
 * @returns A map of depot JSON strings, with keys 'stable' and 'beta'. If unified is true, only 'stable' is present.
 */
export async function createDepotJsonsFromGithub({
  repoId,
  client = new Octokit(),
  readable = true,
  unified = false,
  quietWarnings = false
}: {
  repoId: {
    owner: string
    repo: string
  }
  client?: Octokit
  readable?: boolean
  unified?: boolean
  quietWarnings?: boolean
}): Promise<DepotJsonMap> {
  // get releases from github
  const rawReleases = (await client.repos.listReleases(repoId)).data

  // Get all of the assets of all the releases and attempt to retrieve their template details.
  const templatePromises: Promise<
    TemplateDetails | retrieveTemplateDetails.Error
  >[] = rawReleases.flatMap(release =>
    release.assets.map(asset =>
      retrieveTemplateDetails(
        {
          ...repoId,
          asset_id: asset.id,
          asset_url: asset.browser_download_url
        },
        client
      )
    )
  )
  // NOTE:  What happens if there is a lot of assets (thousands)?
  //        Does NodeJS properly handle the cpu load,
  //        or do we need extra logic in order to prevent overloading the cpu?

  // Wait until all the template details are retrieved and filter out any errors.
  const templates = (await Promise.all(templatePromises)).filter(
    (t): t is TemplateDetails => {
      if ('error' in t) {
        // log errors
        if (quietWarnings !== true) console.warn(t) // TODO: implement logger
        return false
      } else return true
    }
  )

  const depotEntries = templates.map(createDepotEntry)
  // if we want all versions in a single depot, we can just return the depot with all entries
  if (unified) return { stable: stringifyDepot(depotEntries, readable) }
  // otherwise we need to separate the entries into stable and beta versions

  const stableEntries = []
  const betaEntries = []

  for (const entry of depotEntries) {
    // if the version has a prerelease tag, then it is a beta version
    if (semver.parse(entry.version)?.prerelease.length ?? 0 > 0) {
      betaEntries.push(entry)
    } else {
      stableEntries.push(entry)
    }
  }

  const stableJson = stringifyDepot(stableEntries, readable)
  const betaJson = stringifyDepot(betaEntries, readable)
  return {
    stable: stableJson,
    beta: betaJson
  }
}
