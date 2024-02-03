import * as core from '@actions/core'
import * as github from '@actions/github'
import { DepotRouteMap, RepositoryIdentifier } from './types'
import { updateDepots } from './update'

const repoInputRegex = /[^\/\n\s\t]+\/[^\/\n\s\t]+/

function getRepositoryIdentifier(): RepositoryIdentifier {
  const repo: { owner: string; repo: string } = github.context.repo
  const repoInput = core.getInput('repo')

  core.info('Repository input: ' + repoInput)

  if (repoInput.match(repoInputRegex)) {
    const parsedRepoInput = repoInput.split('/')
    repo.owner = parsedRepoInput[0]
    repo.repo = parsedRepoInput[1]
  } else throw new Error('Invalid repository input: ' + repoInput)
  return repo
}

function getDepotLocations(): DepotRouteMap {
  const stableBranch = core.getInput('branch')
  const stablePath = core.getInput('path')
  const betaBranch = core.getInput('pre-release-branch')
  const betaPath = core.getInput('pre-release-path')

  return {
    stable: {
      branch: stableBranch,
      path: stablePath
    },
    beta: {
      branch: betaBranch,
      path: betaPath
    }
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const repo = getRepositoryIdentifier()
    const routes = getDepotLocations()

    const readableFlag = core.getInput('readable') === 'true'
    const ghToken = core.getInput('token')
    const message = core.getInput('message')

    updateDepots({
      destRepo: repo,
      srcRepo: repo,
      routes,
      readableJson: readableFlag,
      token: ghToken,
      message
    })
  } catch (error) {
    // Fail the workflow run if an error occurs
    console.trace()
    if (error instanceof Error) core.setFailed(error.message)
  }
}
