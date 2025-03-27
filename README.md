# Sony Serial Tally Companion Module

A Companion module for controlling Sony mixers via the Sony Serial Tally backend application.

## Features

- Switch AUX sources directly from Companion
- Display current status of all AUX channels
- Automatic updates when changes occur
- Support for custom source and AUX channel names
- Monitor connection status to the mixer
- Connect/disconnect the mixer via Companion

## Installation

```bash
# Navigate to your Companion modules directory
cd ~/companion/module-local

# Clone this repository
git clone https://github.com/oxe-nep/companion-module-sony-app.git

# Enter the directory
cd companion-module-sony-app

# Install dependencies
npm install

# Build the module
npm run build
```

After manual installation, restart Companion for the module to be detected.

## Configuration

Once the module is installed, add a new instance:

1. Go to "Connections" in the Companion UI
2. Click on "+ Connection"
3. Select "Sony Serial Tally"
4. Configure the following settings:
   - **Server URL**: URL to your Sony Serial Tally backend and port to connect to
   - **Update Interval**: How often the module should fetch status (in milliseconds)

## Usage

### Available Actions

- **Switch AUX Source**: Change the source for a specific AUX channel
- **Connect to Mixer**: Request the backend to connect to the Sony mixer
- **Disconnect from Mixer**: Disconnect from the mixer
- **Refresh Status**: Request a manual status update

### Available Feedbacks

- **AUX Source Feedback**: Shows if a specific AUX channel is set to a particular source
- **Connection Status**: Shows if the backend is connected to the mixer

### Usage Examples

1. **Create buttons to switch AUX sources**:
   - Create a new button
   - Add the "Switch AUX Source" action
   - Select the AUX channel and desired source
   - Add feedback for the same AUX source to show current status

2. **Monitor connection status**:
   - Create a new button
   - Add the "Connection Status" feedback
   - Add the "Connect to Mixer" action on click

## Dependencies

- This module requires the Sony Serial Tally backend running on a server in the network
- Companion 3.0 or later