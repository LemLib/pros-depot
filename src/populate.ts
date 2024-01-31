import { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import AdmZip from 'adm-zip'
import { DepotEntry } from './types'

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
/**
 * Creates a JSON string by populating the depot with templates from a GitHub repository.
 * @param repoId The repository to populate the depot from.
 * @param client The client to use for GitHub API requests.
 * @param readable Whether to format the JSON string for human readability.
 * @returns
 */
export async function populateDepotJsonFromGithub(
  repoId: {
    owner: string
    repo: string
  },
  client: Octokit = new Octokit(),
  readable: boolean = true
): Promise<string> {
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
  const depotJson = JSON.stringify(depotEntries, null, readable ? 2 : undefined)
  return depotJson
}
