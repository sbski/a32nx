// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <iostream>

#include "DataManager.h"
#include "SimObjectBase.h"
#include "SimconnectExceptionStrings.h"
#include "Event.h"

DataManager::DataManager() = default;

bool DataManager::initialize(HANDLE hdl) {
  hSimConnect = hdl;
  isInitialized = true;
  return true;
}

bool DataManager::preUpdate(sGaugeDrawData* pData) {
  LOG_TRACE("DataManager::preUpdate()");
  if (!isInitialized) {
    std::cerr << "DataManager::preUpdate() called but DataManager is not initialized" << std::endl;
    return false;
  }

  tickCounter++;
  timeStamp = pData->t;

  // get all variables set to automatically read
  for (auto &var: variables) {
    if (var.second->isAutoRead()) {
      var.second->updateFromSim(timeStamp, tickCounter);
      LOG_DEBUG_BLOCK(if (tickCounter % 100 == 0) {
        std::cout << "DataManager::preUpdate() - auto read named and aircraft: "
                  << var.second->getVarName() << " = " << var.second->get()
                  << std::endl;
      })
    }
  }

  // request all data definitions set to automatically read
  for (auto &ddv: simObjects) {
    if (ddv.second->isAutoRead()) {
      if (!ddv.second->requestUpdateFromSim(timeStamp, tickCounter)) {
        std::cerr << "DataManager::preUpdate(): requestUpdateFromSim() failed for "
                  << ddv.second->getVarName() << std::endl;
      }
      LOG_DEBUG_BLOCK(if (tickCounter % 100 == 0) {
        std::cout << "DataManager::preUpdate() - auto read simobjects: " << ddv.second->getVarName()
                  << std::endl;
      })
    }
  }

  // get requested sim object data
  getRequestedData();

  LOG_TRACE("DataManager::preUpdate() - done");
  return true;
}

bool DataManager::update([[maybe_unused]] sGaugeDrawData* pData) const {
  if (!isInitialized) {
    std::cerr << "DataManager::update() called but DataManager is not initialized" << std::endl;
    return false;
  }
  // empty
  return true;
}

bool DataManager::postUpdate([[maybe_unused]] sGaugeDrawData* pData) {
  LOG_TRACE("DataManager::postUpdate()");
  if (!isInitialized) {
    std::cerr << "DataManager::postUpdate() called but DataManager is not initialized" << std::endl;
    return false;
  }

  // write all variables set to automatically write
  for (auto &var: variables) {
    if (var.second->isAutoWrite()) {
      var.second->updateToSim();
      LOG_DEBUG_BLOCK(if (tickCounter % 100 == 0) {
        std::cout << "DataManager::postUpdate() - auto write named and aircraft: "
                  << var.second->getVarName() << " = " << var.second->get()
                  << std::endl;
      })
    }
  }

  // write all data definitions set to automatically write
  for (auto &ddv: simObjects) {
    if (ddv.second->isAutoWrite()) {
      if (!ddv.second->updateDataToSim(timeStamp, tickCounter)) {
        std::cerr << "DataManager::postUpdate(): updateDataToSim() failed for "
                  << ddv.second->getVarName() << std::endl;
      }
      LOG_DEBUG_BLOCK(if (tickCounter % 100 == 0) {
        std::cout << "DataManager::postUpdate() - auto write simobjects" << ddv.second->getVarName()
                  << std::endl;
      })
    }
  }

  LOG_TRACE("DataManager::postUpdate() - done");
  return true;
}

bool DataManager::shutdown() {
  isInitialized = false;
  std::cout << "DataManager::shutdown()" << std::endl;
  return true;
}

void DataManager::getRequestedData() {
  DWORD cbData;
  SIMCONNECT_RECV* ptrData;
  while (SUCCEEDED(SimConnect_GetNextDispatch(hSimConnect, &ptrData, &cbData))) {
    processDispatchMessage(ptrData, &cbData);
  }
}

NamedVariablePtr DataManager::make_named_var(const std::string &varName,
                                             Unit unit,
                                             bool autoReading,
                                             bool autoWriting,
                                             FLOAT64 maxAgeTime,
                                             UINT64 maxAgeTicks) {
  // The name needs to contain all the information to identify the variable
  // and the expected value uniquely. This is because the same variable can be
  // used in different places with different expected values via Units.
  const std::string uniqueName = varName + ":" + unit.name;

  LOG_DEBUG("DataManager::make_named_var(): " + uniqueName);

  // Check if variable already exists
  // Check which update method and frequency to use - if two variables are the same
  // use the update method and frequency of the automated one with faster update frequency
  if (auto pair = variables.find(uniqueName); pair != variables.end()) {
    if (!pair->second->isAutoRead() && autoReading) {
      pair->second->setAutoRead(true);
    }
    if (pair->second->getMaxAgeTime() > maxAgeTime) {
      pair->second->setMaxAgeTime(maxAgeTime);
    }
    if (pair->second->getMaxAgeTicks() > maxAgeTicks) {
      pair->second->setMaxAgeTicks(maxAgeTicks);
    }
    if (!pair->second->isAutoWrite() && autoWriting) {
      pair->second->setAutoWrite(true);
    }
    LOG_DEBUG("DataManager::make_named_var(): already exists: " + pair->second->str());
    return std::dynamic_pointer_cast<NamedVariable>(pair->second);
  }

  // Create new var and store it in the map
  std::shared_ptr<NamedVariable> var = std::make_shared<NamedVariable>(varName, unit, autoReading, autoWriting, maxAgeTime, maxAgeTicks);

  //  the actual var name of the created variable will have a prefix added to it,
  //  so we can't use var->getVarName() here
  variables[uniqueName] = var;

  LOG_DEBUG("DataManager::make_named_var(): created variable " + var->str());

  return var;
}

AircraftVariablePtr DataManager::make_aircraft_var(const std::string &varName,
                                                   int index,
                                                   const std::string &setterEventName,
                                                   EventPtr setterEvent,
                                                   Unit unit,
                                                   bool autoReading,
                                                   bool autoWriting,
                                                   FLOAT64 maxAgeTime,
                                                   UINT64 maxAgeTicks) {
  // The name needs to contain all the information to identify the variable
  // and the expected value uniquely. This is because the same variable can be
  // used in different places with different expected values via Index and Units.
  const std::string uniqueName = varName + ":" + std::to_string(index) + ":" + unit.name;

  LOG_DEBUG("DataManager::make_aircraft_var(): " + uniqueName);

  // Check if variable already exists
  // Check which update method and frequency to use - if two variables are the same
  // use the update method and frequency of the automated one with faster update frequency
  if (auto pair = variables.find(uniqueName); pair != variables.end()) {
    if (!pair->second->isAutoRead() && autoReading) {
      pair->second->setAutoRead(true);
    }
    if (pair->second->getMaxAgeTime() > maxAgeTime) {
      pair->second->setMaxAgeTime(maxAgeTime);
    }
    if (pair->second->getMaxAgeTicks() > maxAgeTicks) {
      pair->second->setMaxAgeTicks(maxAgeTicks);
    }
    if (!pair->second->isAutoWrite() && autoWriting) {
      pair->second->setAutoWrite(true);
    }

    LOG_DEBUG("DataManager::make_aircraft_var(): already exists: " + pair->second->str());

    return std::dynamic_pointer_cast<AircraftVariable>(pair->second);
  }
  // Create new var and store it in the map
  std::shared_ptr<AircraftVariable> var;
  if (setterEventName.empty()) {
    var = setterEventName.empty() ? std::make_shared<AircraftVariable>(varName, index, std::move(setterEvent), unit, autoReading,
                                                                       autoWriting, maxAgeTime, maxAgeTicks)
                                  : std::make_shared<AircraftVariable>(varName, index, setterEventName, unit, autoReading, autoWriting,
                                                                       maxAgeTime, maxAgeTicks);
  }

  variables[uniqueName] = var;

  LOG_DEBUG("DataManager::make_aircraft_var(): created variable " + var->str());

  return var;
}

AircraftVariablePtr DataManager::make_simple_aircraft_var(const std::string &varName,
                                                          Unit unit,
                                                          bool autoReading,
                                                          FLOAT64 maxAgeTime,
                                                          UINT64 maxAgeTicks) {
  LOG_DEBUG("DataManager::make_simple_aircraft_var(): " + varName);

  // The name needs to contain all the information to identify the variable
  // and the expected value uniquely. This is because the same variable can be
  // used in different places with different expected values via Index and Units.
  const std::string uniqueName = varName + ":" + std::to_string(0) + ":" + unit.name;

  // Check if variable already exists
  // Check which update method and frequency to use - if two variables are the same
  // use the update method and frequency of the automated one with faster update frequency
  if (auto pair = variables.find(uniqueName); pair != variables.end()) {
    if (!pair->second->isAutoRead() && autoReading) {
      pair->second->setAutoRead(true);
    }
    if (pair->second->getMaxAgeTime() > maxAgeTime) {
      pair->second->setMaxAgeTime(maxAgeTime);
    }
    if (pair->second->getMaxAgeTicks() > maxAgeTicks) {
      pair->second->setMaxAgeTicks(maxAgeTicks);
    }
    LOG_DEBUG("DataManager::make_simple_aircraft_var(): already exists: " + pair->second->str());
    return std::dynamic_pointer_cast<AircraftVariable>(pair->second);
  }

  // Create new var and store it in the map
  AircraftVariablePtr var = std::make_shared<AircraftVariable>(varName, 0, "", unit, autoReading, false, maxAgeTime, maxAgeTicks);

  variables[uniqueName] = var;

  LOG_DEBUG("DataManager::make_simple_aircraft_var(): already exists: " + var->str());
  return var;
}

SubscribableEventPtr DataManager::make_event(
  const std::string &eventName,
  bool immediateSubscribe,
  bool maksEvent
) {
  // find existing event instance for this event
  for (auto &event: events) {
    if (event.second->getEventName() == eventName) {
      LOG_DEBUG("DataManager::make_event(): already exists: " + event.second->str());
      return event.second;
    }
  }

  const SIMCONNECT_CLIENT_EVENT_ID id = eventIDGen.getNextId();
  SubscribableEventPtr event = std::make_shared<Event>(
    hSimConnect, eventName, id, immediateSubscribe, maksEvent);

  events[id] = event;

  LOG_DEBUG("DataManager::make_event(): created event " + event->str());
  return event;
}

// =================================================================================================
// Private methods
// =================================================================================================


void DataManager::processDispatchMessage(SIMCONNECT_RECV* pRecv, [[maybe_unused]] DWORD* cbData) {
  switch (pRecv->dwID) {
    case SIMCONNECT_RECV_ID_SIMOBJECT_DATA:
      processSimObjectData(reinterpret_cast<SIMCONNECT_RECV_SIMOBJECT_DATA*>(pRecv));
      break;

    case SIMCONNECT_RECV_ID_EVENT:
      processEvent(reinterpret_cast<const SIMCONNECT_RECV_EVENT*>(pRecv));
      break;

    case SIMCONNECT_RECV_ID_EVENT_EX1:
      processEvent(reinterpret_cast<const SIMCONNECT_RECV_EVENT_EX1*>(pRecv));
      break;

    case SIMCONNECT_RECV_ID_OPEN:
      LOG_INFO("DataManager: SimConnect connection established");
      break;

    case SIMCONNECT_RECV_ID_QUIT:
      LOG_INFO("DataManager: Received SimConnect connection quit message");
      break;

    case SIMCONNECT_RECV_ID_EXCEPTION: {
      auto* const pException = reinterpret_cast<SIMCONNECT_RECV_EXCEPTION*>(pRecv);
      LOG_ERROR("DataManager: Exception in SimConnect connection: "
                + SimconnectExceptionStrings::getSimConnectExceptionString(
        static_cast<SIMCONNECT_EXCEPTION>(pException->dwException))
                + " send_id:" + std::to_string(pException->dwSendID)
                + " index:" + std::to_string(pException->dwIndex));
      break;
    }

    default:
      break;
  }
}

void DataManager::processSimObjectData(const SIMCONNECT_RECV_SIMOBJECT_DATA* data) {
  if (auto pair = simObjects.find(data->dwRequestID); pair != simObjects.end()) {
    pair->second->receiveDataFromSimCallback(data);
    return;
  }
  std::cerr << "DataManager::processSimObjectData() - unknown request id: "
               + std::to_string(data->dwRequestID);
}

void DataManager::processEvent(const SIMCONNECT_RECV_EVENT* pRecv) {
  if (auto pair = events.find(pRecv->uEventID); pair != events.end()) {
    pair->second->processEvent(pRecv);
    return;
  }
  // ignore unknown events as it can happen that non-subscribable events are also received
  // which we can ignore
  LOG_DEBUG("DataManager::processEvent() - unknown event id: "
            + std::to_string(pRecv->uEventID));
}

void DataManager::processEvent(const SIMCONNECT_RECV_EVENT_EX1* pRecv) {
  if (auto pair = events.find(pRecv->uEventID); pair != events.end()) {
    pair->second->processEvent(pRecv);
    return;
  }
  // ignore unknown events as it can happen that non-subscribable events are also received
  // which we can ignore
  LOG_DEBUG("DataManager::processEvent() - unknown event ex1 id: "
            + std::to_string(pRecv->uEventID));
}
