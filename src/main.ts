import * as core from '@actions/core'
import * as github from '@actions/github'
import { DepotRouteMap, RepositoryIdentifier } from './types'
import { updateDepots } from './update'

const repoInputRegex = /[^\/\n\s\t]+\/[^\/\n\s\t]+/

function getRepositoryIdentifier(repoInput: string): RepositoryIdentifier {
  const repo: { owner: string; repo: string } = github.context.repo

  if (repoInput.match(repoInputRegex)) {
    const parsedRepoInput = repoInput.split('/')
    repo.owner = parsedRepoInput[0]
    repo.repo = parsedRepoInput[1]
  } else throw new Error('Invalid repository input: ' + repoInput)
  return repo
}
function getRepositoryIdentifiers(): Record<
  'srcRepo' | 'destRepo',
  RepositoryIdentifier
> {
  const destInput = core.getInput('repo')
  let srcInput = core.getInput('source-repo')
  srcInput ??= destInput

  const srcRepo = getRepositoryIdentifier(srcInput)
  const destRepo = getRepositoryIdentifier(destInput)
  return { srcRepo, destRepo }
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
    const repos = getRepositoryIdentifiers()
    const routes = getDepotLocations()

    const readableFlag = core.getInput('readable-json') === 'true'
    const quietWarningsFlag = core.getInput('quiet') === 'true'
    const ignoreNonTemplateAssetsFlag =
      core.getInput('ignore-non-template-assets') === 'true'
    const ghToken = core.getInput('token')
    let message: string | undefined = core.getInput('message') || undefined
    updateDepots({
      ...repos,
      routes,
      readableJson: readableFlag,
      token: ghToken,
      message,
      logConfig: {
        quietWarnings: quietWarningsFlag,
        ignoreNonTemplateAssets: ignoreNonTemplateAssetsFlag
      }
    })
  } catch (error) {
    // Fail the workflow run if an error occurs
    console.trace()
    if (error instanceof Error) core.setFailed(error.message)
  }
}
