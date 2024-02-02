import { Octokit } from "@octokit/rest"
import { DepotJsonMap, DepotLocation, DepotRouteMap, DepotType, Inputs, RepositoryIdentifier } from "./types"
import { createCommitMessage } from "./message"
import { pushDepotJsonToGithub } from "./pushDepot"
import { createDepotJsonsFromGithub } from "./json"

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

async function getOldJson(
  location: DepotLocation,
  client: Octokit
): Promise<string> {
  const res = await client.repos.getContent({
    ...location,
    ref: location.branch
  })
  return res.data.toString()
}

export async function updateDepots({
  repo,
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
    repo,
    client,
    readableJson,
    unified
  )

  // remove beta depot if it's route has an undefined part
  const depots = filterDepots(repo, routes, jsons)
  for (const depot of depots) {
    const oldJson = await getOldJson(depot, client)
    if (oldJson === depot.json) continue
    const message = createCommitMessage(depot.json, oldJson)
    await pushDepotJsonToGithub(
      depot.json,
      depot,
      messageInput ?? message,
      client
    )
  }
  return depots
}