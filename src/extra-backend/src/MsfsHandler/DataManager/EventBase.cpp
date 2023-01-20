// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <sstream>

#include "logging.h"
#include "EventBase.h"

EventBase::EventBase(HANDLE hdlSimConnect, const std::string &eventName, DWORD eventClientID)
    : hSimConnect(hdlSimConnect), eventName(eventName), eventClientID(eventClientID) {

  if (!SUCCEEDED(SimConnect_MapClientEventToSimEvent(hSimConnect, eventClientID, eventName.c_str()))) {
    LOG_DEBUG("Failed to map event " + eventName + " to client ID " + std::to_string(eventClientID));
  }
}

void EventBase::trigger_ex1(DWORD data0, DWORD data1, DWORD data2, DWORD data3, DWORD data4) const {
  const bool result = SUCCEEDED(SimConnect_TransmitClientEvent_EX1(
    hSimConnect,
    SIMCONNECT_OBJECT_ID_USER,
    eventClientID,
    SIMCONNECT_GROUP_PRIORITY_HIGHEST,
    SIMCONNECT_EVENT_FLAG_GROUPID_IS_PRIORITY,
    data0,
    data1,
    data2,
    data3,
    data4));
  if (!result) {
    LOG_ERROR("Failed to trigger_ex1 event " + eventName + " with client ID " + std::to_string(eventClientID));
  }
}

[[maybe_unused]]
void EventBase::trigger(DWORD data0) const {
  const bool result = SUCCEEDED(SimConnect_TransmitClientEvent(
    hSimConnect,
    SIMCONNECT_OBJECT_ID_USER,
    eventClientID,
    data0,
    SIMCONNECT_GROUP_PRIORITY_HIGHEST,
    SIMCONNECT_EVENT_FLAG_GROUPID_IS_PRIORITY));
  if (!result) {
    LOG_ERROR("Failed to trigger event " + eventName + " with client event " + std::to_string(eventClientID));
  }
}

std::string EventBase::str() const {
  std::stringstream ss;
  ss << "NamedVariable: [" << eventName;
  ss << ", ClientID:" << eventClientID << "]";
  ss << "]";
  return ss.str();
}
