import { sandbox } from '../src/octokit'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mockGraphQL(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>,
  name: string,
  body?: string
) {
  const response = { status: 200, body: data }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matcher = (_: string, options: Record<string, any>): boolean => {
    if (body == null) {
      return true
    }

    if (options.body == null) {
      return false
    }

    return options.body.toString().includes(body)
  }
  return sandbox.mock(
    {
      method: 'POST',
      url: 'https://api.github.com/graphql',
      name,
      functionMatcher: matcher
    },
    response,
    { sendAsJson: true }
  )
}
