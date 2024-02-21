import * as React from "react";
import type {
  NovaEvent,
  NovaEventing,
  EventWrapper,
  Source,
} from "@nova/types";
import { InputType } from "@nova/types";
import invariant from "invariant";

// Context is initialized with an empty object and this is null-checked within the hooks
const NovaEventingContext = React.createContext<INovaEventingContext>({});

// Both properties are optional in the context for initialization state only, but eventing must be supplied in the props
interface INovaEventingContext {
  eventing?: NovaReactEventing;
  unmountEventing?: NovaReactEventing;
}

interface NovaEventingProviderProps {
  eventing: NovaEventing;
  /**
   * Optional version of eventing to use when unmounting, defaults to eventing if not supplied via props
   */
  unmountEventing?: NovaEventing;
  /**
   * Mapping logic to transform a React SyntheticEvent into a Nova
   * Source object. Supply the Nova default implemenation using the import
   * "mapEventMetadata".
   * */
  reactEventMapper: (reactEventWrapper: ReactEventWrapper) => EventWrapper;
  children?: React.ReactNode | undefined;
}

export interface ReactEventWrapper {
  event: NovaEvent<unknown>;
  /**
   * React event generated from the user interaction
   */
  reactEvent: React.SyntheticEvent;
}

export interface GeneratedEventWrapper {
  event: NovaEvent<unknown>;
  /**
   * Optional details about the originating event like input method and timestamp
   */
  source?: Source;
  /**
   * Optional timestamp in milliseconds since epoch format,
   * by default will use Date.now() if override not supplied.
   */
  timeStampOverride?: number;
}

export interface NovaReactEventing {
  /**
   * Bubble a user interaction event up to the host application.
   * @param event the React SyntheticEvent and the Nova Event metadata associated with it.
   */
  bubble(event: ReactEventWrapper): Promise<void>;
  /**
   * Generate a programmatic event to pass up the host application.
   * Use this if the event is not associated with a React SyntheticEvent.
   * @param event the NovaEvent to fire.
   */
  generateEvent(eventWrapper: GeneratedEventWrapper): Promise<void>;
}

export const NovaEventingProvider: React.FunctionComponent<
  NovaEventingProviderProps
> = ({ children, eventing, unmountEventing, reactEventMapper }) => {
  // Nova contexts provide a facade over framework functions
  // We don't need to trigger rerender in children when we are rerendered
  // or when the input functions change, we just need to make sure callbacks
  // use the right functions
  const eventingRef = React.useRef(eventing);
  if (eventingRef.current !== eventing) {
    eventingRef.current = eventing;
  }

  const unmountEventingRef = React.useRef(unmountEventing || eventing);
  if (unmountEventingRef.current !== unmountEventing) {
    unmountEventingRef.current = unmountEventing || eventing; // default to eventing if unmountEventing not supplied
  }

  const mapperRef = React.useRef(reactEventMapper);
  if (mapperRef.current !== reactEventMapper) {
    mapperRef.current = reactEventMapper;
  }

  const reactEventing = React.useMemo(
    generateEventing(eventingRef, mapperRef),
    [],
  );

  const reactUnmountEventing = React.useMemo(
    generateEventing(unmountEventingRef, mapperRef),
    [],
  );

  const contextValue = React.useMemo(
    () => ({ eventing: reactEventing, unmountEventing: reactUnmountEventing }),
    [reactEventing, reactUnmountEventing],
  );

  return (
    <NovaEventingContext.Provider value={contextValue}>
      {children}
    </NovaEventingContext.Provider>
  );
};
NovaEventingProvider.displayName = "NovaEventingProvider";

export const useNovaEventing = (): NovaReactEventing => {
  const { eventing } = React.useContext(NovaEventingContext);
  invariant(
    eventing,
    "Nova Eventing provider must be initialized prior to consumption of eventing!",
  );
  return eventing;
};

/**
 * Used for eventing that should be triggered when the component is unmounted, such as within a useEffect cleanup function
 * If unmountEventing has not been supplied to the NovaEventingProvider, this will fallback to use the defualt eventing instance
 *
 * @returns NovaReactEventing
 */
export const useNovaUnmountEventing = (): NovaReactEventing => {
  const { unmountEventing } = React.useContext(NovaEventingContext);
  invariant(
    unmountEventing,
    "Nova Eventing provider must be initialized prior to consumption of unmountEventing!",
  );
  return unmountEventing;
};

const generateEventing =
  (
    eventingRef: React.MutableRefObject<NovaEventing>,
    mapperRef: React.MutableRefObject<
      (reactEventWrapper: ReactEventWrapper) => EventWrapper
    >,
  ) =>
  (): NovaReactEventing => ({
    bubble: (eventWrapper: ReactEventWrapper) => {
      const mappedEvent: EventWrapper = mapperRef.current(eventWrapper);
      return eventingRef.current.bubble(mappedEvent);
    },
    generateEvent: (eventWrapper: GeneratedEventWrapper) => {
      const mappedEvent = {
        event: eventWrapper.event,
        source: eventWrapper.source ?? {
          inputType: InputType.programmatic,
          timeStamp: eventWrapper.timeStampOverride ?? Date.now(),
        },
      };
      return eventingRef.current.bubble(mappedEvent);
    },
  });
