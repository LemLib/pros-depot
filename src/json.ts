import { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import AdmZip from 'adm-zip'
import { Depot, DepotEntry, DepotType } from './types'
import semver from 'semver'

interface TemplateDetails {
  name: string
  supported_kernels: string
  target: string
  version: string
  url: string
}

function validateTemplateDetails(details: unknown): details is TemplateDetails {
  return (
    details !== null &&
    typeof details === 'object' &&
    (['name', 'supported_kernels', 'target', 'version', 'url'] as const).every(
      key =>
        key in details &&
        typeof (details as Record<typeof key, unknown>)[key] === 'string'
    )
  )
}

async function retrieveTemplateDetails(
  {
    repo,
    owner,
    asset_id,
    asset_url
  }: {
    repo: string
    owner: string
    asset_id: number
    asset_url: string
  },
  client: Octokit
): Promise<TemplateDetails | null> {
  const rawAsset = await client.repos.getReleaseAsset({
    repo,
    owner,
    asset_id,
    headers: { accept: 'application/octet-stream' }
  })
  const data = rawAsset.data
  if (data instanceof ArrayBuffer) {
    const zip = new AdmZip(Buffer.from(data))
    const templateJson = JSON.parse(zip.readAsText('template.pros'))
    const templateInfo = templateJson['py/state']
    const details = {
      name: templateInfo.name,
      supported_kernels: templateInfo.supported_kernels,
      target: templateInfo.target,
      version: templateInfo.version,
      url: asset_url
    }
    if (validateTemplateDetails(details)) return details
  }
  return null
}

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
 * Creates a JSON string by populating the depot with templates from a GitHub repository.
 * @param repoId The repository to populate the depot from.
 * @param client The client to use for GitHub API requests.
 * @param readable Whether to format the JSON string for human readability.
 * @param unified Whether the beta and stable versions should be contained in a single depot.
 * @returns
 */
export async function createDepotJsonsFromGithub(
  repoId: {
    owner: string
    repo: string
  },
  client: Octokit = new Octokit(),
  readable: boolean = true,
  unified: boolean = false
): Promise<Record<'stable', string> & Partial<Record<DepotType, string>>> {
  const rawReleases = await client.repos.listReleases(repoId)

  const templatePromises: Promise<TemplateDetails | null>[] =
    rawReleases.data.map(release =>
      retrieveTemplateDetails(
        {
          ...repoId,
          asset_id: release.assets[0].id,
          asset_url: release.assets[0].browser_download_url
        },
        client
      )
    )
  const templates = (await Promise.all(templatePromises)).filter(
    (t): t is NonNullable<Awaited<(typeof templatePromises)[number]>> =>
      t !== null
  )

  const depotEntries = templates.map(createDepotEntry)
  if (unified) return { stable: stringifyDepot(depotEntries, readable) }

  const stableEntries = []
  const betaEntries = []

  for (const entry of depotEntries) {
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
