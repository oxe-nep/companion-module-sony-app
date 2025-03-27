import { InstanceBase, InstanceStatus, runEntrypoint, SomeCompanionConfigField } from '@companion-module/base'
import { io, Socket } from 'socket.io-client'
import { UpdateActions } from './actions'
import { GetConfigFields } from './config'
import { UpdateFeedbacks } from './feedbacks'

// Variabel-definition interface
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

// Interface för input information
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

    // Hämta namn från servern innan vi initierar actions och feedbacks
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
    
    // Hämta namn från servern när konfigurationen uppdateras
    await this.fetchNames()
    
    this.updateVariableDefinitions()
    this.initWebSocket()
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return GetConfigFields()
  }
  
  // Hämta input och aux namn från servern
  private async fetchNames(): Promise<void> {
    try {
      const baseUrl = `http://${this.config.host}:${this.config.port}`;
      this.log('info', `Försöker hämta namn från ${baseUrl}`);
      
      // Hämta alla inputs från servern
      try {
        const inputsResponse = await fetch(`${baseUrl}/api/inputs`);
        
        if (inputsResponse.ok) {
          const inputs = await inputsResponse.json() as Input[];
          this.allInputs = inputs;
          this.log('info', `Hämtade ${inputs.length} inputs från servern`);
          
          // Uppdatera även inputNames med namnen från inputs
          inputs.forEach(input => {
            if (input.customName) {
              this.inputNames[input.id] = input.customName;
            }
          });
        } else {
          this.log('warn', `Kunde inte hämta inputs: HTTP ${inputsResponse.status} - ${inputsResponse.statusText}`);
        }
      } catch (inputsErr) {
        this.log('error', `Fel vid inputs fetch: ${inputsErr}`);
      }
      
      // Hämta input namn (custom lookuptabell)
      try {
        const inputNamesResponse = await fetch(`${baseUrl}/api/input-names`);
        
        if (inputNamesResponse.ok) {
          const data = await inputNamesResponse.json();
          this.inputNames = data;
          this.log('info', `Hämtade ${Object.keys(this.inputNames).length} input namn från servern`);
        } else {
          this.log('warn', `Kunde inte hämta input namn: HTTP ${inputNamesResponse.status} - ${inputNamesResponse.statusText}`);
        }
      } catch (inputErr) {
        this.log('error', `Fel vid input namn fetch: ${inputErr}`);
      }
      
      // Hämta aux namn
      try {
        const auxNamesResponse = await fetch(`${baseUrl}/api/aux-names`);
        
        if (auxNamesResponse.ok) {
          const data = await auxNamesResponse.json();
          this.auxNames = data;
          this.log('info', `Hämtade ${Object.keys(this.auxNames).length} aux namn från servern`);
        } else {
          this.log('warn', `Kunde inte hämta aux namn: HTTP ${auxNamesResponse.status} - ${auxNamesResponse.statusText}`);
        }
      } catch (auxErr) {
        this.log('error', `Fel vid aux namn fetch: ${auxErr}`);
      }
      
      // Även med tomma data uppdaterar vi variablerna
      this.updateVariableDefinitions();
    } catch (err) {
      this.log('error', `Fel vid hämtning av namn: ${err}`);
    }
  }
  
  // Uppdatera variabler när AUX-status ändras
  private updateVariables(): void {
    // Uppdatera variabler för varje AUX
    for (const [auxId, status] of Object.entries(this.auxStatuses)) {
      // Variabel för det aktiva källnamnet
      const sourceNameVar = `${auxId}_source_name`
      const sourceName = status.customSourceName || status.sourceName || 'Unknown'
      this.setVariableValues({ [sourceNameVar]: sourceName })
      
      // Variabel för det aktiva käll-ID
      const sourceIdVar = `${auxId}_source_id`
      this.setVariableValues({ [sourceIdVar]: status.sourceId.toString() })
      
      // Variabel för AUX-namnet
      const auxNameVar = `${auxId}_name`
      const auxName = status.customAuxName || auxId
      this.setVariableValues({ [auxNameVar]: auxName })
    }
  }
  
  // Definiera variabeldefinitioner
  private updateVariableDefinitions(): void {
    const variables: VariableDefinition[] = []
    
    // Variabler för varje AUX
    for (let i = 1; i <= 11; i++) {
      const auxId = `aux${i}`
      const auxName = this.auxNames[auxId] || `AUX ${i}`
      
      variables.push({
        name: `${auxName} Source Name`,
        variableId: `${auxId}_source_name`,
      })
      
      variables.push({
        name: `${auxName} Source ID`,
        variableId: `${auxId}_source_id`,
      })
      
      variables.push({
        name: `${auxName} Name`,
        variableId: `${auxId}_name`,
      })
    }
    
    // Variabler för alla tillgängliga inputs (både från allInputs och inputNames)
    const allInputIds = new Set<string>()
    
    // Lägg till alla inputs från allInputs
    this.allInputs.forEach(input => allInputIds.add(input.id))
    
    // Lägg till alla input IDs från inputNames
    Object.keys(this.inputNames).forEach(id => allInputIds.add(id))
    
    // Skapa variabler för varje unik input
    Array.from(allInputIds).sort((a, b) => parseInt(a) - parseInt(b)).forEach(inputId => {
      // Hitta inputen från allInputs (om den finns)
      const input = this.allInputs.find(i => i.id === inputId)
      
      // Namn att visa i variabeln
      const displayName = this.inputNames[inputId] || (input?.name || `Input ${inputId}`)
      
      // Variabel för displayNamet (anpassat namn om det finns, annars mixerns namn)
      variables.push({
        name: `Input ${inputId} Name`,
        variableId: `input_${inputId}_name`,
      })
      
      // Variabel för mixerns originella namn (om det finns)
      if (input?.name) {
        variables.push({
          name: `Input ${inputId} Original Name`,
          variableId: `input_${inputId}_original_name`,
        })
        this.setVariableValues({ [`input_${inputId}_original_name`]: input.name })
      }
      
      // Sätt variabelvärdet för det huvudsakliga namnet
      this.setVariableValues({ [`input_${inputId}_name`]: displayName })
      
      // Logga för debugging
      this.log('debug', `Input ${inputId}: display="${displayName}", original="${input?.name || 'unknown'}", custom="${this.inputNames[inputId] || 'none'}"`)
    })
    
    // Lägg till variabel för mixeranslutning
    variables.push({
      name: 'Mixer Connection Status',
      variableId: 'mixer_connected'
    });
    this.setVariableValues({ 'mixer_connected': this.mixerConnected ? 'Ansluten' : 'Frånkopplad' });
    
    this.log('info', `Definierar ${variables.length} variabler i Companion`)
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
      
      // Lyssna på namnuppdateringar
      this.socket.on('inputNamesUpdate', (names: Record<string, string>) => {
        this.inputNames = names
        this.updateVariableDefinitions()
      })
      
      this.socket.on('auxNamesUpdate', (names: Record<string, string>) => {
        this.auxNames = names
        this.updateVariableDefinitions()
      })

      // I initWebSocket-metoden, lägg till lyssnare för anslutningsstatus
      this.socket.on('mixerConnectionStatus', (status: { connected: boolean }) => {
        this.mixerConnected = status.connected;
        this.log('info', `Mixer anslutningsstatus: ${status.connected ? 'Ansluten' : 'Frånkopplad'}`);
        
        // Uppdatera variabel
        this.setVariableValues({ 'mixer_connected': status.connected ? 'Ansluten' : 'Frånkopplad' });
        
        // Uppdatera feedbacks
        this.checkFeedbacks('mixer_connection');
      });
    } catch (err) {
      this.log('error', `Failed to connect to ${url}: ${err}`)
      this.updateStatus(InstanceStatus.ConnectionFailure)
    }
  }

  // Funktion för att byta AUX-källa
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

  // Funktion för att hämta AUX-status
  getAuxStatus(auxId: string): AuxStatus | undefined {
    return this.auxStatuses[auxId]
  }
  
  // Funktion för att få input namn
  getInputName(inputId: string): string {
    return this.inputNames[inputId] || `Input ${inputId}`
  }
  
  // Funktion för att få aux namn
  getAuxName(auxId: string): string {
    return this.auxNames[auxId] || `AUX ${auxId.replace('aux', '')}`
  }

  // Funktion för att hämta alla inputs för actions/feedbacks
  getAllInputs(): Input[] {
    return this.allInputs
  }

  // Funktion för att generera input-val för dropdowns
  getInputChoices(): { id: string; label: string }[] {
    const choices: { id: string; label: string }[] = []
    
    // Lägg till alla inputs i dropdownen
    this.allInputs.forEach(input => {
      const displayName = this.inputNames[input.id] || input.name
      choices.push({
        id: input.id,
        label: `${input.id}: ${displayName}`
      })
    })
    
    // Sortera efter ID
    choices.sort((a, b) => parseInt(a.id) - parseInt(b.id))
    
    return choices
  }

  updateActions(): void {
    UpdateActions(this)
  }

  updateFeedbacks(): void {
    UpdateFeedbacks(this)
  }

  // Lägg till getter för mixerConnected
  getMixerConnectionStatus(): boolean {
    return this.mixerConnected;
  }

  // Lägg till dessa publika metoder för att hantera socket-kommunikation
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