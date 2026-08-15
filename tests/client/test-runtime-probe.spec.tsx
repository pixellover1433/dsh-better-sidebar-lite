import { describe, expect, it } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
// Merges the ui-layout SlotMap declaration so 'shell.overlay' is a valid slot key.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

describe('dsh test-runtime probe', () => {
  it('mounts a real slot runtime and renders an overlay entry', async () => {
    const rt = await SlotTestRuntime.create()
    try {
      // Declare the shell.overlay list slot under an auto frame.
      await rt.declare({ 'shell.overlay': { kind: 'list', scope: 'root' } })
      // Register a trivial entry exactly like a plugin would.
      const dispose = rt.slots.register({
        name: 'shell.overlay',
        id: 'probe',
      }, function Probe() {
        return <div data-testid="probe-entry">hello</div>
      })
      const view = rt.renderSlot('shell.overlay', {})
      expect(view.view.getByTestId('probe-entry')).toBeTruthy()
      expect(view.view.getByText('hello')).toBeTruthy()
      dispose()
    } finally {
      await rt.dispose()
    }
  })
})
