// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_A32NX_EVENT_H
#define FLYBYWIRE_A32NX_EVENT_H

#include <functional>
#include <map>

#include "EventBase.h"

// TODO: Improve Callbacks
//  Because of the map of callbacks and callbacks being different for normal events and ex1 events
//  the callback function requires all parameters to be passed. This is not optimal and should be
//  improved in the future.

typedef uint64_t CallbackID;
typedef std::function<void(
  int number, DWORD param0, DWORD param1, DWORD param2, DWORD param3,
  DWORD param4)> CallbackFunction;

class Event : public EventBase {
private:
  static constexpr SIMCONNECT_NOTIFICATION_GROUP_ID groupId = 0;

  IDGenerator callbackIdGen{};

  std::map<CallbackID, CallbackFunction> callbacks;

  bool isSubscribedToSim = false;
  bool maskEvent;


public:
  Event() = delete; // no default constructor
  Event(const Event &) = delete; // no copy constructor
  Event &operator=(const Event &) = delete; // no copy assignment
  ~Event() override = default;

  Event(
    HANDLE hdlSimConnect,
    const std::string &eventName,
    SIMCONNECT_CLIENT_EVENT_ID eventClientId,
    bool immediateSubscribe = false,
    bool maskEvent = false);

  void subscribeToSim();
  void unsubscribeFromSim();

  [[nodiscard]]
  CallbackID addCallback(const std::function<void(int, DWORD, DWORD, DWORD, DWORD, DWORD)> &callback);
  bool removeCallback(CallbackID callbackId);

  void processEvent(const SIMCONNECT_RECV_EVENT* pEvent);
  void processEvent(const SIMCONNECT_RECV_EVENT_EX1* pEvent);

  [[nodiscard]] std::string str() const override;
};

#endif //FLYBYWIRE_A32NX_EVENT_H
