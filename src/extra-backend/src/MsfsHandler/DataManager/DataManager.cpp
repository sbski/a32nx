// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <iostream>

#include "logging.h"
#include "DataManager.h"
#include "SimconnectExceptionStrings.h"
#include "SimObjectBase.h"

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
#if LOG_LEVEL >= DEBUG_LVL
      if (tickCounter % 100 == 0) {
        std::cout << "DataManager::preUpdate() - auto read named and aircraft: "
        << var.second->getVarName()  << " = " << var.second->get()  << std::endl;
      }
#endif
    }
  }

  // request all data definitions set to automatically read
  for (auto &ddv: dataDefinitionVariables) {
    if (ddv->isAutoRead()) {
      if (!ddv->requestUpdateFromSim(timeStamp, tickCounter)) {
        std::cerr << "DataManager::preUpdate(): requestUpdateFromSim() failed for "
                  << ddv->getName() << std::endl;
      }
#if LOG_LEVEL >= DEBUG_LVL
      if (tickCounter % 100 == 0) {
        std::cout << "DataManager::preUpdate() - auto read simobjects: "
                  << ddv->getName() << std::endl;
      }
#endif
    }
  }

  // get requested sim object data
  requestData();

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
  // aircraft variables are not writeable and will return false for isAutoWrite()
  // so this will not be called
  for (auto &var: variables) {
    if (var.second->isAutoWrite()) {
      var.second->updateToSim();
#if LOG_LEVEL >= DEBUG_LVL
      if (tickCounter % 100 == 0) {
        std::cout << "DataManager::postUpdate() - auto write named and aircraft: "
                  << var.second->getVarName()  << " = " << var.second->get()  << std::endl;
      }
#endif
    }
  }

  // write all data definitions set to automatically write
  for (auto &ddv: dataDefinitionVariables) {
    if (ddv->isAutoWrite()) {
      if (!ddv->updateDataToSim(timeStamp, tickCounter)) {
        std::cerr << "DataManager::postUpdate(): updateDataToSim() failed for "
                  << ddv->getName() << std::endl;
      }
#if LOG_LEVEL >= DEBUG_LVL
      if (tickCounter % 100 == 0) {
        std::cout << "DataManager::postUpdate() - auto write simobjects"
                  << ddv->getName()  << std::endl;
      }
#endif
    }
  }

  LOG_TRACE("DataManager::postUpdate() - done");
  return true;
}

bool DataManager::processSimObjectData(const SIMCONNECT_RECV_SIMOBJECT_DATA* data) {
  for (auto &ddv: dataDefinitionVariables) {
    if (ddv->getRequestId() == data->dwRequestID) {
      ddv->receiveDataFromSimCallback(data);
      return true;
    }
  }
  std::cout << "DataManager::processSimObjectData(): no matching request id found" << std::endl;
  return false;
}

bool DataManager::shutdown() {
  isInitialized = false;
  std::cout << "DataManager::shutdown()" << std::endl;
  return true;
}

void DataManager::requestData() {
  DWORD cbData;
  SIMCONNECT_RECV* ptrData;
  while (SUCCEEDED(SimConnect_GetNextDispatch(hSimConnect, &ptrData, &cbData))) {
    processDispatchMessage(ptrData, &cbData);
  }
}

NamedVariablePtr DataManager::make_named_var(
  const std::string &varName,
  Unit unit,
  bool autoReading,
  bool autoWriting,
  FLOAT64 maxAgeTime,
  UINT64 maxAgeTicks) {

  // The name needs to contain all the information to identify the variable
  // and the expected value uniquely. This is because the same variable can be
  // used in different places with different expected values via Units.
  const std::string uniqueName = varName + ":" + unit.name;

#if LOG_LEVEL >= DEBUG_LVL
  std::cout << "DataManager::make_named_var(): " << uniqueName << std::endl;
#endif

  // Check if variable already exists
  // Check which update method and frequency to use - if two variables are the same
  // use the update method and frequency of the automated one with faster update frequency
  if (variables.find(uniqueName) != variables.end()) {
    if (!variables[uniqueName]->isAutoRead() && autoReading) {
      variables[uniqueName]->setAutoRead(true);
    }
    if (variables[uniqueName]->getMaxAgeTime() > maxAgeTime) {
      variables[uniqueName]->setMaxAgeTime(maxAgeTime);
    }
    if (variables[uniqueName]->getMaxAgeTicks() > maxAgeTicks) {
      variables[uniqueName]->setMaxAgeTicks(maxAgeTicks);
    }
    if (!variables[uniqueName]->isAutoWrite() && autoWriting) {
      variables[uniqueName]->setAutoWrite(true);
    }
#if LOG_LEVEL >= DEBUG_LVL
    std::cout << "DataManager::make_named_var(): variable "
              << uniqueName << " already exists: "
              << variables[uniqueName]
              << std::endl;
#endif
    return std::dynamic_pointer_cast<NamedVariable>(variables[uniqueName]);
  }

  // Create new var and store it in the map
  std::shared_ptr<NamedVariable> var =
    std::make_shared<NamedVariable>(varName, unit, autoReading, autoWriting, maxAgeTime, maxAgeTicks);

#if LOG_LEVEL >= DEBUG_LVL
  std::cout << "DataManager::make_named_var(): creating variable "
            << varName << " (" << var << ")"
            << std::endl;
#endif

  //  the actual var name of the created variable will have a prefix added to it
  //  so we canÄt use var->getVarName() here
  variables[uniqueName] = var;

  return var;
}

AircraftVariablePtr DataManager::make_aircraft_var(
  const std::string &varName,
  int index,
  const std::string& setterEventName,
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

#if LOG_LEVEL >= DEBUG_LVL
  std::cout << "DataManager::make_aircraft_var(): " << uniqueName << std::endl;
#endif

  // Check if variable already exists
  // Check which update method and frequency to use - if two variables are the same
  // use the update method and frequency of the automated one with faster update frequency
  if (variables.find(uniqueName) != variables.end()) {
    if (!variables[uniqueName]->isAutoRead() && autoReading) {
      variables[uniqueName]->setAutoRead(true);
    }
    if (variables[uniqueName]->getMaxAgeTime() > maxAgeTime) {
      variables[uniqueName]->setMaxAgeTime(maxAgeTime);
    }
    if (variables[uniqueName]->getMaxAgeTicks() > maxAgeTicks) {
      variables[uniqueName]->setMaxAgeTicks(maxAgeTicks);
    }
    if (!variables[uniqueName]->isAutoWrite() && autoWriting) {
      variables[uniqueName]->setAutoWrite(true);
    }

#if LOG_LEVEL >= DEBUG_LVL
    std::cout << "DataManager::make_aircraft_var(): variable "
              << uniqueName << " already exists: "
              << variables[uniqueName]
              << std::endl;
#endif
    return std::dynamic_pointer_cast<AircraftVariable>(variables[uniqueName]);
  }
  // Create new var and store it in the map
  std::shared_ptr<AircraftVariable> var;
  if (setterEventName.empty()) {
    var = setterEventName.empty() ?
          std::make_shared<AircraftVariable>(
            varName, index, std::move(setterEvent),
            unit, autoReading, autoWriting, maxAgeTime, maxAgeTicks)
                                  :
          std::make_shared<AircraftVariable>(
            varName, index, setterEventName,
            unit, autoReading, autoWriting, maxAgeTime, maxAgeTicks);
  }

#if LOG_LEVEL >= DEBUG_LVL
  std::cout << "DataManager::make_named_var(): creating variable "
            << varName << " (" << var << ")"
            << std::endl;
#endif

  variables[uniqueName] = var;

  return var;
}

AircraftVariablePtr DataManager::make_simple_aircraft_var(
  const std::string &varName,
  Unit unit,
  bool autoReading,
  FLOAT64 maxAgeTime,
  UINT64 maxAgeTicks) {

#if LOG_LEVEL >= DEBUG_LVL
  std::cout << "DataManager::make_simple_aircraft_var(): " << varName << std::endl;
#endif

  // The name needs to contain all the information to identify the variable
  // and the expected value uniquely. This is because the same variable can be
  // used in different places with different expected values via Index and Units.
  const std::string uniqueName = varName + ":" + std::to_string(0) + ":" + unit.name;

  // Check if variable already exists
  // Check which update method and frequency to use - if two variables are the same
  // use the update method and frequency of the automated one with faster update frequency
  if (variables.find(uniqueName) != variables.end()) {
    if (!variables[uniqueName]->isAutoRead() && autoReading) {
      variables[uniqueName]->setAutoRead(true);
    }
    if (variables[uniqueName]->getMaxAgeTime() > maxAgeTime) {
      variables[uniqueName]->setMaxAgeTime(maxAgeTime);
    }
    if (variables[uniqueName]->getMaxAgeTicks() > maxAgeTicks) {
      variables[uniqueName]->setMaxAgeTicks(maxAgeTicks);
    }

#if LOG_LEVEL >= DEBUG_LVL
    std::cout << "DataManager::make_simple_aircraft_var(): variable "
              << uniqueName << " already exists: "
              << variables[uniqueName]
              << std::endl;
#endif
    return std::dynamic_pointer_cast<AircraftVariable>(variables[uniqueName]);
  }

  // Create new var and store it in the map
  AircraftVariablePtr var = std::make_shared<AircraftVariable>(
    varName, 0, "", unit, autoReading, false, maxAgeTime, maxAgeTicks);

#if LOG_LEVEL >= DEBUG_LVL
  std::cout << "DataManager::make_simple_aircraft_var(): creating variable "
            << varName << " (" << var << ")"
            << std::endl;
#endif

  variables[uniqueName] = var;

  return var;
}

DataDefinitionVariablePtr DataManager::make_datadefinition_var(
  const std::string &name,
  std::vector<SimObjectBase::DataDefinition> &dataDefinitions,
  void* dataStruct,
  size_t dataStructSize,
  bool autoReading,
  bool autoWriting,
  FLOAT64 maxAgeTime,
  UINT64 maxAgeTicks) {
  DataDefinitionVariablePtr var =
    std::make_shared<DataDefinitionVariable>(
      hSimConnect,
      name,
      dataDefinitions,
      dataDefIDGen.getNextId(),
      dataReqIDGen.getNextId(),
      dataStruct,
      dataStructSize,
      autoReading,
      autoWriting,
      maxAgeTime,
      maxAgeTicks);

#if LOG_LEVEL >= DEBUG_LVL
  std::cout << "DataManager::make_datadefinition_var(): " << name << std::endl;
#endif

  dataDefinitionVariables.push_back(var);
  return var;
}


EventPtr DataManager::make_event(const std::string &eventName) {
  if (events.find(eventName) != events.end()) {
    return events[eventName];
  }
  std::shared_ptr<Event> event = std::make_shared<Event>(hSimConnect, eventName, eventIDGen.getNextId());
  events[eventName] = event;
  return event;
}

// =================================================================================================
// Private methods
// =================================================================================================

void DataManager::processDispatchMessage(SIMCONNECT_RECV* pRecv, [[maybe_unused]] DWORD* cbData) {
  switch (pRecv->dwID) {

    case SIMCONNECT_RECV_ID_SIMOBJECT_DATA:
      processSimObjectData(static_cast<SIMCONNECT_RECV_SIMOBJECT_DATA*>(pRecv));
      break;

    case SIMCONNECT_RECV_ID_OPEN:
      std::cout << "DataManager: SimConnect connection established" << std::endl;
      break;

    case SIMCONNECT_RECV_ID_QUIT:
      std::cout << "DataManager: Received SimConnect connection quit message" << std::endl;
      break;

    case SIMCONNECT_RECV_ID_EXCEPTION:
      std::cerr << "DataManager: Exception in SimConnect connection: ";
      std::cerr
        << SimconnectExceptionStrings::getSimConnectExceptionString(
          static_cast<SIMCONNECT_EXCEPTION>(
            static_cast<SIMCONNECT_RECV_EXCEPTION*>(pRecv)->dwException));
      break;

    default:
      break;
  }
}


