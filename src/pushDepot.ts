import { Octokit } from '@octokit/rest'
import { DepotLocation } from './types'

/**
 * Pushes a commit to the desired branch and repository with the new depot json.
 * @param json The json string to push.
 * @param dest The destination repository, branch, and path.
 * @param client
 */
export async function pushDepotJsonToGithub(
  json: string,
  dest: DepotLocation,
  message: string,
  client: Octokit
): Promise<void> {
  await client.repos.createOrUpdateFileContents({
    ...dest,
    content: Buffer.from(json).toString('base64'),
    message
  })
}
