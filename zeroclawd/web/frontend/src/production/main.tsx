import ProductionRenderer from './ProductionRenderer'
import { acquireProductionRendererRuntime, mountProductionRenderer } from './bootstrap'
import './production.css'

const runtime = acquireProductionRendererRuntime()
mountProductionRenderer(runtime.mount, <ProductionRenderer />)
