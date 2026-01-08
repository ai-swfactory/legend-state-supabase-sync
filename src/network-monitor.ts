import { observable } from '@legendapp/state'

/**
 * Network connection type enumeration.
 * Compatible with @react-native-community/netinfo NetInfoStateType.
 */
export enum NetworkConnectionType {
  unknown = 'unknown',
  none = 'none',
  wifi = 'wifi',
  cellular = 'cellular',
  bluetooth = 'bluetooth',
  ethernet = 'ethernet',
  wimax = 'wimax',
  vpn = 'vpn',
  other = 'other',
}

// Define the network state shape for the observable
export interface NetworkState {
  isConnected: boolean
  connectionType: NetworkConnectionType
  isInternetReachable: boolean | null
}

/**
 * Raw network state from the network info provider.
 * Compatible with @react-native-community/netinfo NetInfoState.
 */
export interface NetInfoState {
  isConnected: boolean | null
  type: NetworkConnectionType
  isInternetReachable: boolean | null
}

// Interface for the NetInfo dependency (for DI and mocking)
export interface INetInfo {
  fetch(): Promise<NetInfoState>
  addEventListener(listener: (state: NetInfoState) => void): () => void // Returns unsubscribe function
}

// The NetworkMonitor class with DI
export class NetworkMonitor {
  private netInfo: INetInfo
  private unsubscribe: (() => void) | null = null
  public state$ = observable<NetworkState>({
    isConnected: false,
    connectionType: NetworkConnectionType.unknown,
    isInternetReachable: null,
  })

  constructor(netInfo: INetInfo) {
    this.netInfo = netInfo
  }

  async startMonitoring() {
    if (this.unsubscribe) return // Already monitoring

    // Initial fetch
    const initialState = await this.netInfo.fetch()
    this.updateState(initialState)

    // Subscribe to changes
    this.unsubscribe = this.netInfo.addEventListener(state => {
      this.updateState(state)
    })
  }

  stopMonitoring() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }

  private updateState(state: NetInfoState) {
    this.state$.assign({
      isConnected: state.isConnected ?? false,
      connectionType: state.type,
      isInternetReachable: state.isInternetReachable,
    })
  }
}
