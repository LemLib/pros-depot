import * as core from '@actions/core'
import * as github from '@actions/github'
import { populateDepotJsonFromGithub } from './populate'
import { Octokit } from '@octokit/rest'
import { pushDepotJsonToGithub } from './pushDepot'
import { createCommitMessage } from './message'

const repoInputRegex = /[^\/\n\s\t]+\/[^\/\n\s\t]+/

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const repo: { owner: string; repo: string } = { owner: '', repo: '' }
    const repoInput = core.getInput('repo')

    if (repoInput.match(repoInputRegex)) {
      const parsedRepoInput = repoInput.split('/')
      repo.owner = parsedRepoInput[0]
      repo.repo = parsedRepoInput[1]
    } else throw new Error('Invalid repository input: ' + repoInput)

    const ghToken = core.getInput('token')
    const readableFlag = core.getInput('readable') === 'true'

    const client = new Octokit({ auth: ghToken })

    const json = await populateDepotJsonFromGithub(repo, client, readableFlag)

    const dest = {
      ...repo,
      branch: core.getInput('branch'),
      path: core.getInput('path')
    }

    const message =
      core.getInput('message') ?? createCommitMessage(json, dest, client)

    await pushDepotJsonToGithub(
      json,
      {
        owner: dest.owner,
        repo: dest.repo,
        path: dest.path,
        branch: dest.branch
      },
      message,
      client
    )
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
