# PROS-Depot
PROS Depot is a GitHub Action that generates a depot json file from a GitHub repository's releases and places this depot in a branch on that repo (or another repo).

## Example Workflow
- [example workflow](https://github.com/meisZWFLZ/LemLib/blob/bbd5e60384ded7e7bde69abc80bddcd6077f0793/.github/workflows/depot.yml)
- [example depot branch](https://github.com/meisZWFLZ/LemLib/tree/depot)
- [example depot json](https://github.com/meisZWFLZ/LemLib/blob/depot/stable.json)
```yml
name: Populate Depot json

on: 
  # runs when this repository's releases are modified
  release: 
  # allows for manual dispatching of the workflow
  workflow_dispatch: 

jobs:
  populate:
    runs-on: ubuntu-latest
    permissions: 
      # permits reading of releases and writing to the depot branch
      contents: write
    steps:
        # where to find gh action and what version to use
      - uses: LemLib/pros-depot@dbaa18709f8239296212a47328a221290bd31fd8
        with:
          # gives the github action the permissions specified above
          token: ${{ github.token }}
          # target repo for depots
          repo: meiszwflz/LemLib
          # where to read releases from (can be omitted if repo is also the repo from which to read releases from)
          source-repo: LemLib/LemLib
          # makes the json output human readable
          readable-json: true
```