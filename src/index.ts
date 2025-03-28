import { InstanceBase, InstanceStatus, runEntrypoint, SomeCompanionConfigField } from '@companion-module/base'
import { io, Socket } from 'socket.io-client'
import { UpdateActions } from './actions'
import { GetConfigFields } from './config'
import { UpdateFeedbacks } from './feedbacks'

// Variable definition interface
interface VariableDefinition {
  name: string
  variableId: string
}

interface AuxStatus {
  auxId: string
  sourceId: number
  sourceName: string
  customSourceName?: string
  customAuxName?: string
}

interface Config {
  host: string
  port: number
}

// Interface for input information
interface Input {
  id: string
  name: string
  customName?: string
}

export class SonyAppInstance extends InstanceBase<Config> {
  private socket: Socket | null = null
  private auxStatuses: Record<string, AuxStatus> = {}
  private inputNames: Record<string, string> = {}
  private auxNames: Record<string, string> = {}
  private allInputs: Input[] = []
  config: Config
  private mixerConnected: boolean = false;

  constructor(internal: unknown) {
    super(internal)
    this.config = { host: '127.0.0.1', port: 3000 }
  }

  async init(config: Config): Promise<void> {
    this.config = config
    this.updateStatus(InstanceStatus.Ok)

    // Fetch names from server before initializing actions and feedbacks
    await this.fetchNames()

    this.updateActions()
    this.updateFeedbacks()
    this.updateVariableDefinitions()
    this.initWebSocket()
  }

  async destroy(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  async configUpdated(config: Config): Promise<void> {
    this.config = config
    
    // Fetch names from server when configuration is updated
    await this.fetchNames()
    
    this.updateVariableDefinitions()
    this.initWebSocket()
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return GetConfigFields()
  }
  
  // Fetch input and aux names from server
  private async fetchNames(): Promise<void> {
    try {
      const baseUrl = `http://${this.config.host}:${this.config.port}`;
      this.log('info', `Attempting to fetch names from ${baseUrl}`);
      
      // Fetch all inputs from server
      try {
        const inputsResponse = await fetch(`${baseUrl}/api/inputs`);
        
        if (inputsResponse.ok) {
          const inputs = await inputsResponse.json() as Input[];
          this.allInputs = inputs;
          this.log('info', `Fetched ${inputs.length} inputs from server`);
          
          // Also update inputNames with names from inputs
          inputs.forEach(input => {
            if (input.customName) {
              this.inputNames[input.id] = input.customName;
            }
          });
        } else {
          this.log('warn', `Could not fetch inputs: HTTP ${inputsResponse.status} - ${inputsResponse.statusText}`);
        }
      } catch (inputsErr) {
        this.log('error', `Error during inputs fetch: ${inputsErr}`);
      }
      
      // Fetch all AUX statuses from server
      try {
        const auxResponse = await fetch(`${baseUrl}/api/aux`);
        
        if (auxResponse.ok) {
          const auxList = await auxResponse.json() as AuxStatus[];
          
          // Update our auxStatuses
          if (Array.isArray(auxList) && auxList.length > 0) {
            this.auxStatuses = {};
            auxList.forEach(auxStatus => {
              this.auxStatuses[auxStatus.auxId] = auxStatus;
            });
            this.log('info', `Fetched ${auxList.length} AUX statuses from server`);
          } else {
            this.log('warn', 'No AUX statuses received from server');
          }
        } else {
          this.log('warn', `Could not fetch AUX statuses: HTTP ${auxResponse.status} - ${auxResponse.statusText}`);
        }
      } catch (auxErr) {
        this.log('error', `Error during AUX statuses fetch: ${auxErr}`);
      }
      
      // Fetch aux names
      try {
        const auxNamesResponse = await fetch(`${baseUrl}/api/aux-names`);
        
        if (auxNamesResponse.ok) {
          const data = await auxNamesResponse.json();
          this.auxNames = data;
          this.log('info', `Fetched ${Object.keys(this.auxNames).length} aux names from server`);
        } else {
          this.log('warn', `Could not fetch aux names: HTTP ${auxNamesResponse.status} - ${auxNamesResponse.statusText}`);
        }
      } catch (auxErr) {
        this.log('error', `Error during aux names fetch: ${auxErr}`);
      }
      
      // Update variables even with empty data
      this.updateVariableDefinitions();
    } catch (err) {
      this.log('error', `Error fetching names: ${err}`);
    }
  }
  
  // Update variables when AUX status changes
  private updateVariables(): void {
    // Update variables for each AUX
    for (const [auxId, status] of Object.entries(this.auxStatuses)) {
      // Variable for the active source name
      const sourceNameVar = '${auxId}_source`
      const sourceName = status.customSourceName || status.sourceName || 'Unknown'
      this.setVariableValues({ [sourceNameVar]: sourceName })
      
      // Variable for the active source ID
      const sourceIdVar = `${auxId}_source_id`
      this.setVariableValues({ [sourceIdVar]: status.sourceId.toString() })
      
      // Variable for AUX name
      const auxNameVar = `${auxId}_name`
      const auxName = status.customAuxName || `AUX ${auxId.replace('aux', '')}`
      this.setVariableValues({ [auxNameVar]: auxName })
    }
  }
  
  // Define variable definitions
  private updateVariableDefinitions(): void {
    const variables: VariableDefinition[] = []
    
    // AUX variables
    Object.keys(this.auxStatuses).forEach(auxId => {
      const auxStatus = this.auxStatuses[auxId]
      if (!auxStatus) return
      
      // Get custom AUX name if available
      const auxName = this.auxNames[auxId] || `AUX ${auxId.replace('aux', '')}`
      
      // Add AUX name variable
      variables.push({
        name: `AUX ${auxId.replace('aux', '')} Name`,
        variableId: `${auxId}_name`,
      })
      
      // Add source name variable
      variables.push({
        name: `AUX ${auxId.replace('aux', '')} Source`,
        variableId: `${auxId}_source`,
      })
      
      // Add source ID variable
      variables.push({
        name: `AUX ${auxId.replace('aux', '')} Source ID`,
        variableId: `${auxId}_source_id`,
      })
      
      // Set values for variables
      this.setVariableValues({
        [`${auxId}_name`]: auxName,
        [`${auxId}_source`]: auxStatus.customSourceName || auxStatus.sourceName || `Input ${auxStatus.sourceId}`,
        [`${auxId}_source_id`]: auxStatus.sourceId.toString()
      })
    })
    
    // Get all unique input IDs from three sources:
    // 1. All inputs already stored
    // 2. Input names from custom names
    // 3. AUX sources that might reference inputs
    const allInputIds = new Set<string>()
    
    // Add from allInputs
    this.allInputs.forEach(input => allInputIds.add(input.id))
    
    // Add from inputNames
    Object.keys(this.inputNames).forEach(id => allInputIds.add(id))
    
    // Add from AUX sources
    Object.values(this.auxStatuses).forEach(status => {
      if (status.sourceId) {
        allInputIds.add(status.sourceId.toString())
      }
    })
    
    // Create variables for each unique input
    Array.from(allInputIds).sort((a, b) => parseInt(a) - parseInt(b)).forEach(inputId => {
      // Find input from allInputs (if it exists)
      const input = this.allInputs.find(i => i.id === inputId)
      
      // Name to display in the variable
      const displayName = this.inputNames[inputId] || (input?.name || `Input ${inputId}`)
      
      // Variable for displayName (custom name if available, otherwise mixer's name)
      variables.push({
        name: `Input ${inputId} Custom Name`,
        variableId: `input_${inputId}_custom_name`,
      })
      
      // Variable for mixer's original name (if available)
      if (input?.name) {
        variables.push({
          name: `Input ${inputId} Name`,
          variableId: `input_${inputId}_name`,
        })
        this.setVariableValues({ [`input_${inputId}_name`]: input.name })
      }
      
      // Set variable value for the main name
      this.setVariableValues({ [`input_${inputId}_name`]: displayName })
      
      // Log for debugging
      this.log('debug', `Input ${inputId}: display="${displayName}", original="${input?.name || 'unknown'}", custom="${this.inputNames[inputId] || 'none'}"`)
    })
    
    // Add variable for mixer connection
    variables.push({
      name: 'Mixer Connection Status',
      variableId: 'mixer_connected'
    });
    this.setVariableValues({ 'mixer_connected': this.mixerConnected ? 'Connected' : 'Disconnected' });
    
    this.log('info', `Defining ${variables.length} variables in Companion`)
    this.setVariableDefinitions(variables)
  }

  private initWebSocket(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    const url = `http://${this.config.host}:${this.config.port}`
    this.log('info', `Connecting to ${url}`)
    
    try {
      this.socket = io(url)

      this.socket.on('connect', () => {
        this.updateStatus(InstanceStatus.Ok)
        this.log('info', 'Connected to Sony Mixer App')
        this.socket?.emit('requestRefresh')
      })

      this.socket.on('disconnect', () => {
        this.updateStatus(InstanceStatus.Disconnected)
        this.log('info', 'Disconnected from Sony Mixer App')
      })

      this.socket.on('error', (error) => {
        this.log('error', 'Socket error: ' + error)
        this.updateStatus(InstanceStatus.ConnectionFailure)
      })

      this.socket.on('initialAuxStatus', (statuses: AuxStatus[]) => {
        this.auxStatuses = {}
        for (const status of statuses) {
          this.auxStatuses[status.auxId] = status
        }
        this.updateVariables()
        this.checkFeedbacks()
      })

      this.socket.on('auxUpdate', (status: AuxStatus) => {
        this.auxStatuses[status.auxId] = status
        this.updateVariables()
        this.checkFeedbacks()
      })
      
      // Listen for name updates
      this.socket.on('inputNamesUpdate', (names: Record<string, string>) => {
        this.inputNames = names
        this.updateVariableDefinitions()
      })
      
      this.socket.on('auxNamesUpdate', (names: Record<string, string>) => {
        this.auxNames = names
        this.updateVariableDefinitions()
      })

      // Add listener for connection status in initWebSocket method
      this.socket.on('mixerConnectionStatus', (status: { connected: boolean }) => {
        this.mixerConnected = status.connected;
        this.log('info', `Mixer connection status: ${status.connected ? 'Connected' : 'Disconnected'}`);
        
        // Update variable
        this.setVariableValues({ 'mixer_connected': status.connected ? 'Connected' : 'Disconnected' });
        
        // Update feedbacks
        this.checkFeedbacks('mixer_connection');
      });
    } catch (err) {
      this.log('error', `Failed to connect to ${url}: ${err}`)
      this.updateStatus(InstanceStatus.ConnectionFailure)
    }
  }

  // Function to change AUX source
  async setAuxSource(auxId: string, sourceId: string): Promise<void> {
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/api/aux/${auxId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceId }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
    } catch (error) {
      this.log('error', `Failed to set AUX source: ${error}`)
    }
  }

  // Function to get AUX status
  getAuxStatus(auxId: string): AuxStatus | undefined {
    return this.auxStatuses[auxId]
  }
  
  // Function to get all AUX statuses
  getAuxStatuses(): Record<string, AuxStatus> {
    return this.auxStatuses
  }
  
  // Function to get all available AUX IDs
  getAvailableAux(): string[] {
    // Return the actual AUX IDs we have in our auxStatuses
    return Object.keys(this.auxStatuses);
  }
  
  // Function to get input name
  getInputName(inputId: string): string {
    return this.inputNames[inputId] || `Input ${inputId}`
  }
  
  // Function to get aux name
  getAuxName(auxId: string): string {
    return this.auxNames[auxId] || `AUX ${auxId.replace('aux', '')}`
  }

  // Function to get all inputs for actions/feedbacks
  getAllInputs(): Input[] {
    return this.allInputs
  }

  // Function to get input choices for dropdowns
  getInputChoices(): { id: string; label: string }[] {
    const choices: { id: string; label: string }[] = []
    
    // Add all inputs from all sources
    const allInputIds = new Set<string>()
    
    // Add from allInputs
    this.allInputs.forEach(input => allInputIds.add(input.id))
    
    // Add from inputNames
    Object.keys(this.inputNames).forEach(id => allInputIds.add(id))
    
    // Add from AUX sources
    Object.values(this.auxStatuses).forEach(status => {
      if (status.sourceId) {
        allInputIds.add(status.sourceId.toString())
      }
    })
    
    // Add additional sources that might be available
    for (let i = 1; i <= 24; i++) {
      allInputIds.add(i.toString())
    }
    
    // Create choices from all available inputs
    Array.from(allInputIds)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(inputId => {
        // Find input data if available
        const input = this.allInputs.find(i => i.id === inputId)
        
        // Get display name with priority: custom name > mixer name > default name
        const displayName = this.inputNames[inputId] || (input?.name || `Input ${inputId}`)
        
        choices.push({
          id: inputId,
          label: `${inputId}: ${displayName}`
        })
      })
    
    return choices
  }

  updateActions(): void {
    UpdateActions(this)
  }

  updateFeedbacks(): void {
    UpdateFeedbacks(this)
  }

  // Getter for mixerConnected
  getMixerConnectionStatus(): boolean {
    return this.mixerConnected;
  }

  // Public methods to handle socket communication
  public requestConnection(): void {
    if (this.socket) {
      this.socket.emit('requestConnection');
    }
  }
  
  public requestDisconnection(): void {
    if (this.socket) {
      this.socket.emit('requestDisconnection');
    }
  }
}

runEntrypoint(SonyAppInstance, [])