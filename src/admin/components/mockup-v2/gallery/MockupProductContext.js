import { createContext, useContext } from 'react'

/**
 * Tells the studio which product it is working for (null while the product is still unsaved) and how to tell the
 * gallery that a mockup was saved. Provided by MockupStudioLauncher; read by the Save-to-gallery button.
 */
export const MockupProductContext = createContext({ productId: null, onMockupsChanged: () => {} })
export const useMockupProduct = () => useContext(MockupProductContext)
