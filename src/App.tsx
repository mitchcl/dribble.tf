import React from 'react'

import { ViewerPage } from '@pages/ViewerPage'
import {
  bootstrapSharedSetupFromHashAction,
  goToTickAction,
  loadEmptySceneMapAction,
  loadSetupsAction,
  loadSettingsAction,
} from '@zus/actions'
import { getState } from '@zus/store'
import { loadEmbeddedDemoAction, resolveEmbeddedDemoAction } from '@utils/embed'

class App extends React.Component {
  state = {
    isReady: false,
  }

  //
  // ─── LIFECYCLE ──────────────────────────────────────────────────────────────────
  //

  async componentDidMount() {
    await loadSettingsAction()
    await loadSetupsAction()
    const sharedSetup = await bootstrapSharedSetupFromHashAction()

    // A demo may be requested by URL (?demo= / ?demoUrl=) when embedded — see @utils/embed.
    // Resolving it first means the empty scene boots straight into that demo's map instead
    // of downloading the default map's model and discarding it seconds later.
    const embeddedDemo = await resolveEmbeddedDemoAction()

    await loadEmptySceneMapAction(
      embeddedDemo?.map ?? sharedSetup?.map ?? getState().scene.map
    )

    this.setState({ isReady: true })

    // Only now that the viewer is mounted — the download progress overlay lives there.
    if (embeddedDemo) {
      const loaded = await loadEmbeddedDemoAction(embeddedDemo)
      if (loaded?.tick) goToTickAction(loaded.tick)
    }

    // Completely disable right clicks cause it's kinda annoying
    // when interacting with UI elements
    window.addEventListener('contextmenu', event => {
      event.preventDefault()
    })
  }

  //
  // ─── RENDER ─────────────────────────────────────────────────────────────────────
  //

  render() {
    return this.state.isReady ? <ViewerPage /> : null
  }
}

export default App
