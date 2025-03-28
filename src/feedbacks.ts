import { CompanionFeedbackDefinition, CompanionFeedbackDefinitions } from '@companion-module/base'
import { SonyAppInstance } from './index'

export function GetFeedbacks(): CompanionFeedbackDefinition[] {
  return []
}

export function UpdateFeedbacks(instance: SonyAppInstance): void {
  const feedbacks: CompanionFeedbackDefinitions = {}

  // Create an array with all AUX options for dropdown
  const auxChoices: { id: string; label: string }[] = []
  
  // Get AUX list from the instance using the same method as actions.ts
  const auxList = instance.getAvailableAux()
  
  // Add available AUX to choices
  auxList.forEach(auxId => {
    const auxName = instance.getAuxName(auxId) || `AUX ${auxId.replace('aux', '')}`
    auxChoices.push({
      id: auxId,
      label: auxName
    })
  })
  

  // Feedback for showing when a specific source is active on a selected AUX
  feedbacks.aux_source_active = {
    type: 'boolean',
    name: 'AUX Source: Selected source is active',
    description: 'When selected source is active on selected AUX, change button style',
    defaultStyle: {
      bgcolor: 0xff0000,
      color: 0xffffff
    },
    options: [
      {
        type: 'dropdown',
        label: 'AUX',
        id: 'auxId',
        default: 'aux1',
        choices: auxChoices
      },
      {
        type: 'dropdown',
        label: 'Source Type',
        id: 'sourceType',
        default: 'id',
        choices: [
          { id: 'id', label: 'Source ID' },
          { id: 'name', label: 'Source Name' }
        ]
      },
      {
        type: 'number',
        label: 'Source ID',
        id: 'sourceId',
        default: 1,
        min: 1,
        max: 24,
        isVisible: (options) => options.sourceType === 'id'
      },
      {
        type: 'dropdown',
        label: 'Source',
        id: 'sourceName',
        default: '1',
        choices: instance.getInputChoices(),
        isVisible: (options) => options.sourceType === 'name'
      }
    ],
    callback: (feedback) => {
      const auxStatus = instance.getAuxStatus(feedback.options.auxId as string)
      return auxStatus?.sourceId.toString() === feedback.options.sourceId.toString()
    },
  }
  
  // Feedback for specific AUX (shows the name of active source)
  feedbacks.aux_source_name = {
    type: 'advanced',
    name: 'AUX Source: Show active source name',
    description: 'Shows the active source name for the selected AUX',
    options: [
      {
        type: 'dropdown',
        label: 'AUX',
        id: 'auxId',
        default: 'aux1',
        choices: auxChoices
      }
    ],
    callback: (feedback) => {
      const auxStatus = instance.getAuxStatus(feedback.options.auxId as string)
      
      if (auxStatus) {
        // Get source name with preference: custom name > original name > ID
        const displayName = auxStatus.customSourceName || auxStatus.sourceName || `Input ${auxStatus.sourceId}`
        
        return {
          text: displayName,
          bgcolor: 0x000000,
          color: 0xffffff,
        }
      }
      
      return {
        text: 'No source',
        bgcolor: 0x000000,
        color: 0x646464,
      }
    },
  }

  // Feedback for mixer connection
  feedbacks.mixer_connection = {
    type: 'boolean',
    name: 'Mixer: Connection status',
    description: 'When switcher is connected, change style',
    defaultStyle: {
      bgcolor: 0x00ff00,
      color: 0x000000
    },
    options: [],
    callback: (feedback): boolean => {
      return instance.getMixerConnectionStatus();
    },
  };

  instance.setFeedbackDefinitions(feedbacks)
} 