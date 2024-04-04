import { Octokit } from '@octokit/rest'
import {
  DepotJsonMap,
  DepotLocation,
  DepotRouteMap,
  DepotType,
  Inputs,
  RepositoryIdentifier
} from './types'
import { createCommitMessage } from './message'
import { pushDepotJsonToGithub } from './pushDepot'
import { createDepotJsonsFromGithub } from './json'

function filterDepots(
  repo: RepositoryIdentifier,
  routes: DepotRouteMap,
  jsons: DepotJsonMap
): Array<DepotLocation & { json: string }> {
  const depots: Array<DepotLocation & { json: string }> = []
  for (const rawType in routes) {
    const type = rawType as DepotType
    const route = routes[type]
    const json = jsons[type]

    if (route?.path != null && route?.branch != null && json != null) {
      depots.push({
        ...repo,
        path: route.path,
        branch: route.branch,
        json
      })
    }
  }

  return depots
}

interface GetGithubFileError {
  label: 'FileNotFound' | 'BranchNotFound' | 'Unknown'
  raw: Error
}
async function getOldFile(
  location: DepotLocation,
  client: Octokit
): Promise<{ json: string; sha: string } | GetGithubFileError> {
  try {
    const res = await client.repos.getContent({
      path: location.path,
      repo: location.repo,
      ref: location.branch,
      owner: location.owner
    })
    if (
      typeof res !== 'object' ||
      res.data == null ||
      Array.isArray(res.data) ||
      !('content' in res.data)
    )
      throw new Error('Invalid response')
    return { json: atob(res.data.content), sha: res.data.sha }
  } catch (e: unknown) {
    if (e instanceof Error) {
      if ('status' in e && e.status === 404) {
        if (e.message.includes('No commit found')) {
          return {
            label: 'BranchNotFound',
            raw: e
          }
        }
        if (e.message === 'Not Found') {
          return {
            label: 'FileNotFound',
            raw: e
          }
        }
      }
      return {
        label: 'Unknown',
        raw: e
      }
    }
    throw e
  }
}

export async function updateDepots({
  srcRepo,
  destRepo,
  token,
  routes,
  readableJson,
  message: messageInput
}: Inputs) {
  const client = new Octokit({ auth: token })

  const unified =
    routes.beta.branch === routes.stable.branch &&
    routes.beta.path === routes.stable.path
  // create depot jsons
  const jsons = await createDepotJsonsFromGithub(
    { repoId: srcRepo, client, readable: readableJson, unified }  )

  // remove beta depot if it's route has an undefined part
  const depots = filterDepots(destRepo, routes, jsons)
  for (const depot of depots) {
    let oldFile = await getOldFile(depot, client)
    let oldJson
    if (typeof oldFile === 'object' && 'label' in oldFile)
      switch (oldFile.label) {
        case 'BranchNotFound':
          oldJson = ''
          break
        case 'FileNotFound':
          try {
            await client.repos.get({ repo: depot.repo, owner: depot.owner })
          } catch (e) {
            if (e instanceof Error && e.message === 'Not Found')
              throw new Error(
                `Repository ${depot.owner}/${depot.repo} not found`
              )
            else throw e
          }
          oldJson = ''
          break
        case 'Unknown':
          const err: Error & { raw?: Error } = new Error(
            `Could not retrieve ${depot.path}`
          )
          err.raw = oldFile.raw
          throw err
      }
    else oldJson = oldFile.json

    if (oldJson === depot.json) {
      console.log(`Depot is already up to date: ${depot.branch}:${depot.path}`)
      continue
    }
    const message = createCommitMessage(depot.json, oldJson)
    await pushDepotJsonToGithub(
      depot.json,
      depot,
      messageInput ?? message,
      client,
      'sha' in oldFile ? oldFile.sha : undefined
    )
  }
  return depots
}
