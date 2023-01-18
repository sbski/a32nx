// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <iostream>
#include <utility>

#include <MSFS/Legacy/gauges.h>
#include <SimConnect.h>

#include "DataDefinitionVariable.h"

bool DataDefinitionVariable::requestDataFromSim() const {
  if (!SUCCEEDED(SimConnect_RequestDataOnSimObject(
    hSimConnect,
    requestId,
    dataDefId,
    SIMCONNECT_OBJECT_ID_USER,
    SIMCONNECT_PERIOD_ONCE))) { // TODO - evtl. support using SIMCONNECT_PERIOD

    std::cerr << "Failed to request data from sim." << std::endl;
    return false;
  }
  return true;
}

bool DataDefinitionVariable::requestUpdateFromSim(FLOAT64 timeStamp, UINT64 tickCounter) {
  // only update if the value is equal or older than the max age for sim time ot ticks
  if (timeStampSimTime + maxAgeTime >= timeStamp || tickStamp + maxAgeTicks >= tickCounter) {
    return true;
  }
  timeStampSimTime = timeStamp;
  tickStamp = tickCounter;

  if (!SUCCEEDED(SimConnect_RequestDataOnSimObject(
    hSimConnect,
    requestId,
    dataDefId,
    SIMCONNECT_OBJECT_ID_USER,
    SIMCONNECT_PERIOD_ONCE))) { // TODO: evtl. support SIMCONNECT_PERIOD

    std::cerr << "Failed to request data from sim." << std::endl;
    return false;
  }
  return true;
}

void DataDefinitionVariable::receiveDataFromSimCallback(const SIMCONNECT_RECV_SIMOBJECT_DATA* pData) {
  SIMPLE_ASSERT(DataDefinitionVariable::structSize == pData->dwDefineCount * sizeof(FLOAT64),
                "DataDefinitionVariable::receiveDataFromSimCallback: Struct size mismatch")
  SIMPLE_ASSERT(pData->dwRequestID == requestId,
                "DataDefinitionVariable::receiveDataFromSimCallback: Request ID mismatch")

  memcpy(DataDefinitionVariable::pDataStruct, &pData->dwData, DataDefinitionVariable::structSize);
}

bool DataDefinitionVariable::writeDataToSim() {
  const bool result = SUCCEEDED(SimConnect_SetDataOnSimObject(
    hSimConnect, dataDefId, SIMCONNECT_OBJECT_ID_USER, 0, 0, DataDefinitionVariable::structSize, DataDefinitionVariable::pDataStruct));
  if (!result) {
    std::cerr << "Setting data to sim for " << name << " with dataDefId=" << dataDefId << " failed!"
              << std::endl;
  }
  return result;
}

bool DataDefinitionVariable::updateDataToSim(FLOAT64 timeStamp, UINT64 tickCounter) {
  if (writeDataToSim()) {
    timeStampSimTime = timeStamp;
    tickStamp = tickCounter;
    return true;
  }
  return false;
}


