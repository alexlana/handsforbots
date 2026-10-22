// Synthesis off the main thread: the page sends a ModelConfig, this worker builds and runs the model.
import { serveTTS } from '@handsforbots/voice-models'
import { buildModel, type ModelConfig } from './models.ts'

serveTTS<ModelConfig>(buildModel)
