# AYDO Server

#Getting started

### Server Installer guide

Before you start you have to prepare:
1. Server/Controller/Hub based on Linux (Raspberry Pi or PC). See minimum hardware requirements:
2. Zigbee Adapter (see - https://www.zigbee2mqtt.io/guide/adapters/)
3. Run command 
`wget -qO- "https://cloud.aydo.ai/setup" | sudo bash`
That script will install a NodeJS, Zigbee2Mqtt, AYDO Core, AYDO Zigbee2Mqtt plugin and all system requirements. 
Wait for installation to finish.
4. After finished installer script find the Zigbee-Adapter
After you plug the adapter in see the `dmesg` output to find the device location:
```
$ sudo dmesg

...
usbcore: registered new interface driver ch341
usbserial: USB Serial support registered for ch341-uart
ch341 3-1:1.0: ch341-uart converter detected
usb 3-1: ch341-uart converter now attached to ttyUSB0
```
As we can see the adapter was identified and mounted on `ttyUSB0`.

```
$ ls -l /dev/ttyUSB0
crw-rw---- 1 root dialout 188, May 16 19:15 /dev/ttyUSB0
```
5. Configuration  
Find and edit config file in zigbee2mqtt-data/configuration.yaml.

Example:
```
# Let new devices join our zigbee network
permit_join: true
# Docker Compose makes the MQTT-Server available using "mqtt" hostname
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://mqtt
# Zigbee Adapter path
serial:
  port: /dev/ttyUSB0
# Enable the Zigbee2MQTT frontend
frontend:
  port: 8080
# Let Zigbee2MQTT generate a new network key on first start
advanced:
  network_key: GENERATE
```
