// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <iostream>
#include <utility>

#include <MSFS/Legacy/gauges.h>
#include <SimConnect.h>

#include "DataDefinitionVariable.h"

bool DataDefinitionVariable::requestFromSim() const {
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

void DataDefinitionVariable::updateFromSimObjectData(const SIMCONNECT_RECV_SIMOBJECT_DATA* pData) {
  SIMPLE_ASSERT(structSize == pData->dwDefineCount * sizeof(FLOAT64),
                "DataDefinitionVariable::updateFromSimObjectData: Struct size mismatch")
  SIMPLE_ASSERT(pData->dwRequestID == requestId,
                "DataDefinitionVariable::updateFromSimObjectData: Request ID mismatch")
  std::memcpy(pDataStruct, &pData->dwData, structSize);
}

bool DataDefinitionVariable::writeToSim() {
  const bool result = SUCCEEDED(SimConnect_SetDataOnSimObject(
    hSimConnect, dataDefId, SIMCONNECT_OBJECT_ID_USER, 0, 0, structSize, pDataStruct));
  if (!result) {
    std::cerr << "Setting data to sim for " << name << " with dataDefId=" << dataDefId << " failed!"
              << std::endl;
  }
  return result;
}

bool DataDefinitionVariable::updateToSim(FLOAT64 timeStamp, UINT64 tickCounter) {
  if (writeToSim()) {
    timeStampSimTime = timeStamp;
    tickStamp = tickCounter;
    return true;
  }
  return false;
}


