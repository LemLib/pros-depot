import * as core from '@actions/core'
import * as github from '@actions/github'
import { populateDepotJsonsFromGithub } from './populate'
import { Octokit } from '@octokit/rest'
import { pushDepotJsonToGithub } from './pushDepot'
import { createCommitMessage } from './message'
import { DepotLocation, DepotType, RepositoryIdentifier } from './types'

const repoInputRegex = /[^\/\n\s\t]+\/[^\/\n\s\t]+/

function getRepositoryIdentifier(): RepositoryIdentifier {
  const repo: { owner: string; repo: string } = { owner: '', repo: '' }
  const repoInput = core.getInput('repo')

  core.info('Repository input: ' + repoInput)

  if (repoInput.match(repoInputRegex)) {
    const parsedRepoInput = repoInput.split('/')
    repo.owner = parsedRepoInput[0]
    repo.repo = parsedRepoInput[1]
  } else throw new Error('Invalid repository input: ' + repoInput)
  return repo
}

function getDepotLocations(
  repo: RepositoryIdentifier
): Record<DepotType, RepositoryIdentifier & Partial<DepotLocation>> {
  const stableBranch = core.getInput('branch')
  const stablePath = core.getInput('path')
  const betaBranch = core.getInput('pre-release-branch')
  const betaPath = core.getInput('pre-release-path')

  return {
    stable: {
      ...repo,
      branch: stableBranch,
      path: stablePath
    },
    beta: {
      ...repo,
      branch: betaBranch,
      path: betaPath
    }
  }
}

function filterDepots(
  locations: ReturnType<typeof getDepotLocations>,
  jsons: Awaited<ReturnType<typeof populateDepotJsonsFromGithub>>
): Array<DepotLocation & { json: string }> {
  const depots: Array<DepotLocation & { json: string }> = []
  for (const rawType in locations) {
    const type = rawType as DepotType
    const location = locations[type]
    const json = jsons[type]

    if (location?.path != null && location?.branch != null && json != null) {
      depots.push({
        ...location,
        path: location.path,
        branch: location.branch,
        json
      })
    }
  }

  return depots
}

async function updateDepotJsons(
  locations: ReturnType<typeof getDepotLocations>,
  jsons: Awaited<ReturnType<typeof populateDepotJsonsFromGithub>>,
  client: Octokit
) {
  const depots = filterDepots(locations, jsons)
  const messageInput = core.getInput('message')
  for (const depot of depots) {
    const message = createCommitMessage(depot.json, depot, client)
    if (message === undefined) continue
    await pushDepotJsonToGithub(
      depot.json,
      depot,
      messageInput ?? message,
      client
    )
  }
  return depots
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const repo = getRepositoryIdentifier()
    const locations = getDepotLocations(repo)

    const readableFlag = core.getInput('readable') === 'true'
    const ghToken = core.getInput('token')

    const client = new Octokit({ auth: ghToken })

    const unified =
      locations.beta.branch === locations.stable.branch &&
      locations.beta.path === locations.stable.path

    const jsons = await populateDepotJsonsFromGithub(
      repo,
      client,
      readableFlag,
      unified
    )

    updateDepotJsons(locations, jsons, client)
  } catch (error) {
    // Fail the workflow run if an error occurs
    console.trace()
    if (error instanceof Error) core.setFailed(error.message)
  }
}
