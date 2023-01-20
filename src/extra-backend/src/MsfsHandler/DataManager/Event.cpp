// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <MSFS/Legacy/gauges.h>
#include <SimConnect.h>
#include <sstream>

#include "logging.h"
#include "Event.h"

Event::Event(
  HANDLE hdlSimConnect, const std::string &eventName, DWORD eventClientId, bool immediateSubscribe,
  bool maskEvent)
  : EventBase(hdlSimConnect, eventName, eventClientId), maskEvent(maskEvent) {

  if (immediateSubscribe) subscribeToSim();

}

void Event::subscribeToSim() {
  if (isSubscribedToSim) {
    LOG_WARN("Event already subscribed to sim" + str());
    return;
  }
  if (!SUCCEEDED(SimConnect_AddClientEventToNotificationGroup(
    hSimConnect, groupId, eventClientID, maskEvent ? TRUE : FALSE))) {
    LOG_ERROR("Failed to add event " + eventName
              + " to client notification group " + std::to_string(groupId));
    return;
  }

  if (!SUCCEEDED(SimConnect_SetNotificationGroupPriority(
    hSimConnect, groupId, SIMCONNECT_GROUP_PRIORITY_HIGHEST))) {
    LOG_ERROR("Failed to set notification group " + std::to_string(groupId)
              + " to highest priority");
    return;
  }

  isSubscribedToSim = true;
  LOG_DEBUG("Subscribed to event " + eventName + " with client ID " + std::to_string(eventClientID));
}

void Event::unsubscribeFromSim() {
  if (!SUCCEEDED(SimConnect_RemoveClientEvent(hSimConnect, groupId, eventClientID))) {
    LOG_ERROR("Failed to remove event " + eventName
              + " from client notification group " + std::to_string(groupId));
    return;
  }
  isSubscribedToSim = false;
  LOG_DEBUG("Unsubscribed from event " + eventName + " with client ID " + std::to_string(eventClientID));
}

CallbackID Event::addCallback(const CallbackFunction &callback) {
  const auto id = callbackIdGen.getNextId();
  callbacks.insert({id, callback});
  LOG_DEBUG("Added callback to event " + eventName + " with callback ID " + std::to_string(id));
  return id;
}

bool Event::removeCallback(CallbackID callbackId) {
  if (auto pair = callbacks.find(callbackId); pair != callbacks.end()) {
    callbacks.erase(pair);
    LOG_DEBUG("Removed callback from event " + eventName + " with callback ID " + std::to_string(callbackId));
    return true;
  }
  LOG_WARN("Failed to remove callback with ID " + std::to_string(callbackId) + " from event " + str());
  return false;
}

void Event::processEvent(const SIMCONNECT_RECV_EVENT* pEvent) {
  for (const auto& [id, callback] : callbacks) {
    callback(1, pEvent->dwData,0,0,0,0);
  }

}

void Event::processEvent(const SIMCONNECT_RECV_EVENT_EX1* pEvent) {
  for (const auto& [id, callback] : callbacks) {
    callback(5, pEvent->dwData0, pEvent->dwData1, pEvent->dwData2, pEvent->dwData3, pEvent->dwData4);
  }
}

std::string Event::str() const {
  std::stringstream ss;
  ss << "NamedVariable: [" << eventName;
  ss << ", ClientID:" << eventClientID << "]";
  ss << ", MaskEvent:" << maskEvent;
  ss << "]";
  return ss.str();
}
