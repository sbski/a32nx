// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_EVENT_H
#define FLYBYWIRE_EVENT_H

#include <iostream>
#include <string>

#include <MSFS/Legacy/gauges.h>
#include <SimConnect.h>
#include "IDGenerator.h"

/**
 * Simple EventBase class to wrap SimConnect events.
 * This current implementation is currently only supporting sending events to the sim.
 * Registering for receiving events is not yet implemented.
 */
class EventBase {
protected:

  HANDLE hSimConnect;

  /**
   * The name of the event in the sim. This is used to register the event.
   */
  const std::string eventName;

  /**
   * The client's ID of the event. This is used to help the sim to map events to the clients ID.
   */
  const SIMCONNECT_CLIENT_EVENT_ID eventClientID;

  /**
   * Constructor to create an event.
   * @param hdlSimConnect The handle of the simconnect instance.
   * @param eventName The name of the event in the sim.
   * @param eventClientID The client's ID of the event to map with the sim event. .
   */
  EventBase(HANDLE hdlSimConnect, const std::string &eventName, DWORD eventClientID);

public:

  EventBase() = delete; // no default constructor
  EventBase(const EventBase&) = delete; // no copy constructor
  EventBase& operator=(const EventBase&) = delete; // no copy assignment
  virtual ~EventBase() = default;

  /**
   * Sends the event with the given data to the sim.
   * @param data0 Parameter 0 of the event.
   * @param data1 Parameter 1 of the event.
   * @param data2 Parameter 2 of the event.
   * @param data3 Parameter 3 of the event.
   * @param data4 Parameter 4 of the event.
   *
   * This uses the "SimConnect_TransmitClientEvent_EX1" function.
   */
  void trigger_ex1(DWORD data0 = 0, DWORD data1 = 0, DWORD data2 = 0, DWORD data3 = 0,
                   DWORD data4 = 0) const;

  /**
   * Sends the event with the given data to the sim.
   * @param data0 Parameter 0 of the event.
   *
   * This uses the "SimConnect_TransmitClientEvent" function.
   */
  [[maybe_unused]]
  void trigger(DWORD data0 = 0) const;

  // Getter and setter
public:
  [[maybe_unused]] [[nodiscard]]
  const std::string &getEventName() const { return eventName; }

  [[maybe_unused]] [[nodiscard]]
  SIMCONNECT_CLIENT_EVENT_ID getEventClientId() const { return eventClientID; }

  [[nodiscard]]
  virtual std::string str() const ;

};

#endif //FLYBYWIRE_EVENT_H
